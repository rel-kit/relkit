import { canonicalJson } from "@relkit/contracts";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildProject } from "./commands/build.js";
import { checkProject } from "./commands/check.js";
import { startDev } from "./commands/dev.js";
import { developmentPorts } from "./commands/dev-inspector.js";
import { startDevSourceWatcher } from "./commands/dev-watch.js";
import { runDeploy } from "./commands/deploy.js";
import { runDoctor } from "./commands/doctor.js";
import { runEnv } from "./commands/env.js";
import { runGraph } from "./commands/graph.js";
import { runStart } from "./commands/start.js";
import { runClient } from "./commands/client.js";
import { CLI_EXIT_CODES, fail, type CliCommandContext } from "./main-support.js";
import type { CliInvocation } from "./cli-effect-runtime.js";

export async function executeCommand(
  invocation: CliInvocation,
  context: CliCommandContext,
): Promise<number> {
  switch (invocation.command) {
    case "check": {
      const result = await checkProject({
        ...optionalProjectRoot(parseProjectArgs(invocation.args, "check").projectRoot),
        signal: context.signal,
      });
      context.reporter.output(result, canonicalJson(result));
      return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
    }
    case "build": {
      const result = await buildProject({
        ...optionalProjectRoot(parseProjectArgs(invocation.args, "build").projectRoot),
        signal: context.signal,
      });
      context.reporter.output(result, canonicalJson(result));
      return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
    }
    case "doctor":
      return runDoctor(invocation.args, context);
    case "dev":
      await runDevCommand(invocation.args, context);
      return CLI_EXIT_CODES.success;
    case "start": {
      const options = parseProjectArgs(invocation.args, "start");
      return runStart({
        ...optionalProjectRoot(options.projectRoot),
        ...(options.port === undefined ? {} : { port: options.port }),
        signal: context.signal,
      });
    }
    case "graph":
      return runGraph(invocation.args, context);
    case "env":
      return runEnv(invocation.args, context);
    case "deploy":
      return runDeploy(invocation.args, context);
    case "client":
      return runClient(invocation.args, context);
    default:
      throw fail("RELKIT_COMMAND_UNAVAILABLE", `Command is not implemented: ${invocation.command}`);
  }
}

async function runDevCommand(args: readonly string[], context: CliCommandContext): Promise<void> {
  const options = parseProjectArgs(args, "dev");
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const ports = await developmentPorts(
    projectRoot,
    options.port,
    options.inspectorPort,
    process.env,
  );
  const generatedDirectory = await createDevGeneratedDirectory(projectRoot);
  try {
    const session = await startDev({
      projectRoot,
      stablePort: ports.backend,
      generatedDirectory,
      signal: context.signal,
      inspector: ports.inspector,
      compile: async (request) => {
        const result = await buildProject({
          projectRoot: request.projectRoot,
          buildDirectory: request.outputDirectory,
          signal: request.signal,
        });
        if (!result.ok)
          throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
        return { entrypoint: "server/index.js" };
      },
    });
    try {
      const watcher = startDevSourceWatcher(session);
      try {
        await session.waitForShutdown();
      } finally {
        watcher.close();
      }
    } finally {
      await session.stop();
    }
  } finally {
    await rm(generatedDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function createDevGeneratedDirectory(projectRoot: string): Promise<string> {
  const generatedRoot = join(projectRoot, ".relkit", "generated");
  await mkdir(generatedRoot, { recursive: true });
  return mkdtemp(join(generatedRoot, ".dev-"));
}

type ProjectArgs = {
  readonly projectRoot?: string;
  readonly port?: number;
  readonly inspectorPort?: number;
};

function parseProjectArgs(args: readonly string[], command: string): ProjectArgs {
  let projectRoot: string | undefined;
  let port: number | undefined;
  let inspectorPort: number | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--project-root") projectRoot = value(args, ++index, argument, command);
    else if (argument === "--port")
      port = portValue(value(args, ++index, argument, command), command);
    else if (argument === "--inspector-port")
      inspectorPort = portValue(value(args, ++index, argument, command), command);
    else
      throw fail(
        `RELKIT_${command.toUpperCase()}_USAGE`,
        `Unknown ${command} option: ${argument}`,
        2,
      );
  }
  return {
    ...(projectRoot === undefined ? {} : { projectRoot }),
    ...(port === undefined ? {} : { port }),
    ...(inspectorPort === undefined ? {} : { inspectorPort }),
  };
}

function optionalProjectRoot(
  projectRoot: string | undefined,
): { readonly projectRoot?: never } | { readonly projectRoot: string } {
  return projectRoot === undefined ? {} : { projectRoot };
}

function value(args: readonly string[], index: number, option: string, command: string): string {
  const result = args[index];
  if (result === undefined || result.startsWith("-"))
    throw fail(`RELKIT_${command.toUpperCase()}_USAGE`, `${option} requires a value.`, 2);
  return result;
}

function portValue(value: string, command: string): number {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535)
    throw fail(`RELKIT_${command.toUpperCase()}_USAGE`, "Port must be between 0 and 65535.", 2);
  return port;
}
