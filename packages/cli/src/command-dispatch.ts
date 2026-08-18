import { canonicalJson } from "@zsys/contracts";
import { buildProject } from "./commands/build.js";
import { checkProject } from "./commands/check.js";
import { runDev } from "./commands/dev.js";
import { runDeploy } from "./commands/deploy.js";
import { runDoctor } from "./commands/doctor.js";
import { runEnv } from "./commands/env.js";
import { runGraph } from "./commands/graph.js";
import { runStart } from "./commands/start.js";
import {
  CLI_EXIT_CODES,
  fail,
  type CliCommandContext,
  type ParsedCliArgs,
} from "./main-support.js";

export async function executeCommand(
  parsed: ParsedCliArgs,
  context: CliCommandContext,
): Promise<number> {
  switch (parsed.command) {
    case "check": {
      const result = await checkProject({
        ...optionalProjectRoot(parseProjectArgs(parsed.args, "check").projectRoot),
        signal: context.signal,
      });
      context.reporter.output(result, canonicalJson(result));
      return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
    }
    case "build": {
      const result = await buildProject({
        ...optionalProjectRoot(parseProjectArgs(parsed.args, "build").projectRoot),
        signal: context.signal,
      });
      context.reporter.output(result, canonicalJson(result));
      return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
    }
    case "doctor":
      return runDoctor(parsed.args, context);
    case "dev":
      await runDevCommand(parsed.args, context);
      return CLI_EXIT_CODES.success;
    case "start":
      return runStart({
        ...optionalProjectRoot(parseProjectArgs(parsed.args, "start").projectRoot),
        signal: context.signal,
      });
    case "graph":
      return runGraph(parsed.args, context);
    case "env":
      return runEnv(parsed.args, context);
    case "deploy":
      return runDeploy(parsed.args, context);
    default:
      throw fail("ZSYS_COMMAND_UNAVAILABLE", `Command is not implemented: ${parsed.command}`);
  }
}

async function runDevCommand(args: readonly string[], context: CliCommandContext): Promise<void> {
  const options = parseProjectArgs(args, "dev");
  await runDev({
    ...(options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot }),
    ...(options.port === undefined ? {} : { stablePort: options.port }),
    signal: context.signal,
    inspector: false,
    compile: async (request) => {
      const result = await buildProject({
        projectRoot: request.projectRoot,
        buildDirectory: request.outputDirectory,
        signal: request.signal,
      });
      if (!result.ok)
        throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
      return { entrypoint: "server/index.ts" };
    },
  });
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
        `ZSYS_${command.toUpperCase()}_USAGE`,
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
    throw fail(`ZSYS_${command.toUpperCase()}_USAGE`, `${option} requires a value.`, 2);
  return result;
}

function portValue(value: string, command: string): number {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535)
    throw fail(`ZSYS_${command.toUpperCase()}_USAGE`, "Port must be between 0 and 65535.", 2);
  return port;
}
