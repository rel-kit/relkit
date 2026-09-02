import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { resolve } from "node:path";
import { CLI_EXIT_CODES, type CliCommandContext } from "../main-support.js";
import { LocalCommandError } from "./local-operation-support.js";
import { localStatus, localStop, localUp } from "./local-operations.js";

export interface LocalCommandDependencies {
  readonly confirm?: (message: string) => boolean | Promise<boolean>;
}

export async function runLocal(
  args: readonly string[],
  context: Pick<CliCommandContext, "json" | "reporter" | "signal" | "tty">,
  dependencies: LocalCommandDependencies = {},
): Promise<number> {
  try {
    const parsed = parseLocalArgs(args);
    if (parsed.command === "up") {
      await localUp(parsed.projectRoot, parsed.detach, context);
      return CLI_EXIT_CODES.success;
    }
    if (parsed.command === "status") {
      await localStatus(parsed.projectRoot, context);
      return CLI_EXIT_CODES.success;
    }
    if (parsed.command === "stop") {
      await localStop(parsed.projectRoot, false, context);
      return CLI_EXIT_CODES.success;
    }
    if (!parsed.yes) {
      const confirm = dependencies.confirm ?? interactiveConfirm(context);
      if (
        !(await confirm(`Reset local containers, volumes, and state for ${parsed.projectRoot}?`))
      ) {
        context.reporter.output(
          { ok: true, command: "reset", cancelled: true },
          "Reset cancelled.",
        );
        return CLI_EXIT_CODES.success;
      }
    }
    await localStop(parsed.projectRoot, true, context);
    return CLI_EXIT_CODES.success;
  } catch (error) {
    const code = errorCode(error);
    context.reporter.error(code, error instanceof Error ? error.message : String(error));
    return code === "RELKIT_LOCAL_USAGE" ? CLI_EXIT_CODES.usage : CLI_EXIT_CODES.failure;
  }
}

type ParsedLocalArgs = {
  readonly command: "up" | "status" | "stop" | "reset";
  readonly projectRoot: string;
  readonly detach: boolean;
  readonly yes: boolean;
};

function parseLocalArgs(args: readonly string[]): ParsedLocalArgs {
  const command = args[0];
  if (command !== "up" && command !== "status" && command !== "stop" && command !== "reset")
    throw usage("Usage: relkit local up|status|stop|reset [options]");
  let projectRoot = process.cwd();
  let detach = false;
  let yes = false;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--project-root") {
      const value = args[++index];
      if (value === undefined || value.startsWith("-"))
        throw usage("--project-root requires a value.");
      projectRoot = resolve(value);
    } else if (argument === "--detach" && command === "up") detach = true;
    else if (argument === "--yes" && command === "reset") yes = true;
    else throw usage(`Unknown local ${command} option: ${String(argument)}`);
  }
  return { command, projectRoot, detach, yes };
}

function interactiveConfirm(
  context: Pick<CliCommandContext, "json" | "tty">,
): (message: string) => Promise<boolean> {
  if (context.json || context.tty !== true)
    throw usage("local reset requires interactive confirmation or --yes.");
  return async (message) => {
    const terminal = createInterface({ input: stdin, output: stdout });
    try {
      return (await terminal.question(`${message} Type "yes" to continue: `)).trim() === "yes";
    } finally {
      terminal.close();
    }
  };
}

function errorCode(error: unknown): string {
  return error !== null && typeof error === "object" && "code" in error
    ? String(error.code)
    : "RELKIT_LOCAL_FAILED";
}

function usage(message: string): LocalCommandError {
  return new LocalCommandError("RELKIT_LOCAL_USAGE", message);
}
