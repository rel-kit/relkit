import { runDevCommand } from "./commands/dev-command.js";
import { parseProjectArgs } from "./commands/project-args.js";
import { formatDiagnostics } from "@relkit/diagnostics";
import { buildProject } from "./commands/build.js";
import { checkProject, type CheckResult } from "./commands/check.js";
import type { BuildResult } from "./commands/build.js";
import { runDeploy } from "./commands/deploy.js";
import { runDoctor } from "./commands/doctor.js";
import { runEnv } from "./commands/env.js";
import { runGraph } from "./commands/graph.js";
import { runLocal } from "./commands/local.js";
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
      context.reporter.output(result, formatCheckResult(result));
      return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
    }
    case "build": {
      const result = await buildProject({
        ...optionalProjectRoot(parseProjectArgs(invocation.args, "build").projectRoot),
        signal: context.signal,
      });
      context.reporter.output(result, formatBuildResult(result));
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
    case "local":
      return runLocal(invocation.args, context);
    case "deploy":
      return runDeploy(invocation.args, context);
    case "client":
      return runClient(invocation.args, context);
    default:
      throw fail("RELKIT_COMMAND_UNAVAILABLE", `Command is not implemented: ${invocation.command}`);
  }
}

function formatCheckResult(result: CheckResult): string {
  return result.ok
    ? `Checked ${result.projectRoot}`
    : formatDiagnostics(result.diagnostics) || "Application check failed.";
}

function formatBuildResult(result: BuildResult): string {
  return result.ok
    ? `Built ${result.buildDirectory}`
    : formatDiagnostics(result.diagnostics) || "Application build failed.";
}

function optionalProjectRoot(
  projectRoot: string | undefined,
): { readonly projectRoot?: never } | { readonly projectRoot: string } {
  return projectRoot === undefined ? {} : { projectRoot };
}
