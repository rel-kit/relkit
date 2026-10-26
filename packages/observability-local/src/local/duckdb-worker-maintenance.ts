/** Runs the existing minute retention checkpoint only while the process owns an open database. */
import { Effect } from "effect";
import type { DuckdbWorkerEffects } from "./duckdb-worker.types.js";
import type { DuckdbProcessState } from "./duckdb-worker-process.types.js";
/** @param worker - Serialized database authority. @param state - Open/close state shared with IPC. @returns Scoped maintenance timer ownership. */
export const installDuckdbWorkerMaintenance = Effect.fn("ObservabilityDuckdb.worker.maintenance")(
  function* (worker: DuckdbWorkerEffects, state: DuckdbProcessState) {
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const timer = setInterval(() => {
          if (!state.opened) return;
          void Effect.runPromise(worker.execute({ type: "flush" })).catch((error) => {
            process.send?.({
              id: 0,
              fatal: true,
              error: `Telemetry cleanup failed: ${String(error)}`,
            });
            process.exitCode = 1;
            process.disconnect?.();
          });
        }, 60_000);
        timer.unref();
        return timer;
      }),
      (timer) =>
        Effect.sync(() => {
          clearInterval(timer);
        }),
    );
  },
);
