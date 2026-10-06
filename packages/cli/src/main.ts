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
  const reporter = createReporter(json, io);
  const controller = new AbortController();
  const signal = runtime.signal
    ? AbortSignal.any([runtime.signal, controller.signal])
    : controller.signal;
  const removeSignals =
    runtime.installSignalHandlers === false ? () => undefined : installSignals(controller);
  try {
    return await runCliEffect(
      runCliProgram(argv, runtime, reporter, io, json, signal),
      Layer.merge(fileSystemLayer, interactionLayer),
      signal,
      { json, io },
    );
  } catch (error) {
    const failure = toFailure(error, signal);
    reporter.error(failure.code, failure.message);
    return failure.exitCode;
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
