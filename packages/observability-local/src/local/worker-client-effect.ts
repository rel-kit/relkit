/**
 * Acquires the optional isolated Node worker and exposes shared structural effects.
 * Its caller owns close; neither record producers nor console logging import it.
 */
import { fork } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { ObservabilityQueryError } from "@relkit/observability";
import { workerFailure } from "@relkit/observability/local/worker-contract";
import type {
  LocalWorkerEffects,
  LocalWorkerCommand,
} from "@relkit/observability/local/worker-contract";
import { createWorkerClientState } from "./worker-client-state.js";
import { sendWorkerCommand, closeWorkerClient } from "./worker-client-send.js";

/**
 * Starts one child without opening a database until the caller sends open.
 * @param onFailure - Receives its first unexpected terminal failure.
 * @returns Lazy worker acquisition with typed IPC failures and explicit close.
 */
export const startLocalWorkerEffect = Effect.fn("observability.worker.start")(function* (
  onFailure: (error: Error) => void = () => undefined,
) {
  return yield* Effect.try({
    try: (): LocalWorkerEffects => createWorkerEffects(onFailure),
    catch: (error) => workerFailure(error, "start"),
  });
});

/** @param onFailure - Terminal diagnostic observer. @returns Structural IPC operations for one owned child. */
function createWorkerEffects(onFailure: (error: Error) => void): LocalWorkerEffects {
  const built = new URL("./duckdb-worker.js", import.meta.url);
  const workerPath = existsSync(built)
    ? built
    : new URL("../../dist/local/duckdb-worker.js", import.meta.url);
  const child = fork(fileURLToPath(workerPath), [], {
    execPath: "node",
    execArgv: [],
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  const state = createWorkerClientState(child, onFailure);
  return {
    pid: child.pid,
    call: Effect.fn("observability.worker.call")((command: LocalWorkerCommand) => {
      if (state.failure) return Effect.fail(workerFailure(state.failure, "worker"));
      if (state.closed)
        return Effect.fail(workerFailure(new Error("Telemetry worker is closed"), "closed"));
      return Effect.tryPromise({
        try: (signal) => sendWorkerCommand(state, command, signal),
        catch: (error) =>
          workerFailure(error, error instanceof ObservabilityQueryError ? "response" : "worker"),
      });
    }),
    close: Effect.fn("observability.worker.close")(() =>
      Effect.uninterruptible(
        Effect.tryPromise({
          try: () => closeWorkerClient(state),
          catch: (error) => workerFailure(error, "worker"),
        }),
      ),
    ),
  };
}
