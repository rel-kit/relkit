#!/usr/bin/env bun
import { runCli } from "./main.js";
import { contributorCallback } from "./contributor-callback.js";
import { Layer } from "effect";
import { runCliEffect } from "./cli-runtime.js";
import { installSignals } from "./main-support.js";
import { isJsonMode } from "./cli-effect-runtime.js";

/**
 * Runs one executable invocation and removes its temporary native signal handlers.
 * @param args - Literal CLI arguments, defaulting to the native argv.
 * @returns Existing command or signal-specific exit status.
 */
export async function run(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  const controller = new AbortController();
  const removeSignals = installSignals(controller);
  try {
    return await runCliEffect(
      contributorCallback(
        "cli.main",
        (signal) => runCli(args, { signal, installSignalHandlers: false }),
        controller.signal,
      ),
      Layer.empty,
      controller.signal,
      {
        json: isJsonMode(args),
        io: {
          stdout: (line) => process.stdout.write(`${line}\n`),
          stderr: (line) => process.stderr.write(`${line}\n`),
        },
      },
    );
  } catch (error) {
    if (
      controller.signal.aborted &&
      controller.signal.reason instanceof Error &&
      "exitCode" in controller.signal.reason &&
      typeof controller.signal.reason.exitCode === "number"
    )
      return controller.signal.reason.exitCode;
    throw error;
  } finally {
    removeSignals();
  }
}

if (import.meta.main) process.exitCode = await run();
