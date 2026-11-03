/** Registers the existing worker command/reply channel within the process owner's Effect scope. */
import { Effect } from "effect";
import { DuckdbQueryError } from "./duckdb-query-error.js";
import type { DuckdbWorkerEffects } from "./duckdb-worker.types.js";
import type { DuckdbWorkerMessage, DuckdbProcessState } from "./duckdb-worker-process.types.js";
/** @param worker - Serialized database executor. @param state - Process maintenance state. @returns Scoped IPC listener registration. */
export const installDuckdbWorkerIpc = Effect.fn("ObservabilityDuckdb.worker.ipc")(function* (
  worker: DuckdbWorkerEffects,
  state: DuckdbProcessState,
) {
  const message = (envelope: DuckdbWorkerMessage): void => {
    void Effect.runPromise(worker.execute(envelope.command))
      .then(
        (value) => {
          if (envelope.command.type === "open") state.opened = true;
          if (envelope.command.type === "close") state.opened = false;
          process.send?.({ id: envelope.id, value });
          if (envelope.command.type === "close") process.disconnect?.();
        },
        (error) => {
          process.send?.({
            id: envelope.id,
            error: error instanceof Error ? error.message : String(error),
            ...(error instanceof DuckdbQueryError ? { code: error.code } : {}),
          });
        },
      )
      .catch(() => {
        process.exitCode = 1;
        try {
          process.disconnect?.();
        } catch {
          /* The IPC channel may already be gone. */
        }
      });
  };
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      process.on("message", message);
      return message;
    }),
    (owned) =>
      Effect.sync(() => {
        process.off("message", owned);
      }),
  );
});
