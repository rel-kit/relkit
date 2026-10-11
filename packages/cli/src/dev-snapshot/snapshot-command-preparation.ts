/**
 * Runs finite snapshot preparation from the narrow bootstrap before the general
 * CLI parser loads. This keeps the generated installation workflow independent
 * of parser-version skew while retaining the same preparation Effect and errors.
 */
import { Cause, Effect, Exit } from "effect";
import { cliOriginalError } from "../cli-errors.js";
import { prepareSnapshotCommand } from "./snapshot-prepare-command.js";
import type { CliCommandContext } from "../main-support-types.js";

/** Executes `dev --prepare` and projects its established terminal exit contract. */
export async function runSnapshotPreparation(
  args: readonly string[],
  signal: AbortSignal,
): Promise<number> {
  const json = args.some((argument) => argument === "--json" || argument.startsWith("--json="));
  const commandArgs = args.filter(
    (argument) => argument !== "--json" && !argument.startsWith("--json="),
  );
  const context: CliCommandContext = {
    command: "dev",
    args: commandArgs,
    json,
    signal,
    reporter: {
      output: (value, human) => console.log(json ? JSON.stringify(value) : (human ?? value)),
      error: (code, message) => console.error(json ? JSON.stringify({ code, message }) : message),
    },
    log: () => undefined,
    onProgress: (message) => console.error(message),
    cwd: process.cwd(),
    interactive: false,
  };
  try {
    const exit = await Effect.runPromiseExit(
      prepareSnapshotCommand(commandArgs, context).pipe(Effect.mapError(cliOriginalError)),
      { signal },
    );
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
    return 0;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    const code =
      "code" in error && typeof error.code === "string" ? error.code : "RELKIT_INTERNAL_ERROR";
    context.reporter.error(code, preparationErrorMessage(error));
    return "exitCode" in error && typeof error.exitCode === "number" ? error.exitCode : 1;
  }
}

/** Produces a bounded useful message for data errors whose Error message is intentionally empty. */
function preparationErrorMessage(error: Error): string {
  if (error.message !== "") return error.message;
  if (
    "reason" in error &&
    typeof error.reason === "string" &&
    "operation" in error &&
    typeof error.operation === "string"
  )
    return `Development snapshot ${error.reason} during ${error.operation}.`;
  return "Development snapshot preparation failed.";
}
