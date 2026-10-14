/** Owns one native CLI invocation, its cancellation signals, presentation and scoped cleanup. */
import { Layer } from "effect";
import { runCliEffect } from "./cli-runtime.js";
import { interactionLayer } from "./cli-interaction.service.js";
import { fileSystemLayer } from "./services/filesystem.service.js";
import { runCliProgram } from "./main-effect.js";
import { isJsonMode } from "./cli-effect-runtime.js";
import {
  createReporter,
  installSignals,
  toFailure,
  type CliIo,
  type CliRuntime,
  type CliReporter,
} from "./main-support.js";

export * from "./cli-help-model.js";
export * from "./main-support.js";

/**
 * Executes one invocation with one service graph and scoped resources.
 * @param argv - Existing command arguments, defaulting to the native process.
 * @param runtime - Optional presentation, generator and cancellation injection.
 * @returns The established CLI exit status after cleanup and log draining.
 */
export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
  runtime: CliRuntime = {},
): Promise<number> {
  const io = runtime.io ?? processIo;
  const json = isJsonMode(argv);
  const migration = argv.find((argument) => !argument.startsWith("-")) === "migrate";
  const reporter = createReporter(json, io);
  let publish: (() => void) | undefined;
  const commandReporter: CliReporter = migration
    ? {
        output: (value, human) => {
          publish = () => reporter.output(value, human);
        },
        error: (code, message) => {
          publish = () => reporter.error(code, message);
        },
      }
    : reporter;
  const controller = new AbortController();
  const signal = runtime.signal
    ? AbortSignal.any([runtime.signal, controller.signal])
    : controller.signal;
  const removeSignals =
    runtime.installSignalHandlers === false ? () => undefined : installSignals(controller);
  try {
    if (signal.aborted) throw signal.reason;
    const code = await runCliEffect(
      runCliProgram(argv, runtime, commandReporter, io, json, signal),
      Layer.merge(fileSystemLayer, interactionLayer),
      signal,
      { json, io: migration && json ? { stdout: io.stderr, stderr: io.stderr } : io },
    );
    publish?.();
    return code;
  } catch (error) {
    const failure = toFailure(error, signal);
    reporter.error(
      failure.code,
      migration
        ? "Migration stopped without reporting successful publication; inspect retained local recovery receipts."
        : failure.message,
    );
    return migration && signal.aborted ? 130 : failure.exitCode;
  } finally {
    removeSignals();
  }
}

/**
 * Runs the native process entry point using the same invocation owner.
 * @param argv - Optional original command arguments.
 * @returns The established CLI exit status after cleanup.
 */
export function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  return runCli(argv);
}

const processIo: CliIo = Object.freeze({
  stdout: (line: string) => process.stdout.write(`${line}\n`),
  stderr: (line: string) => process.stderr.write(`${line}\n`),
});
if (import.meta.main) process.exitCode = await main();
