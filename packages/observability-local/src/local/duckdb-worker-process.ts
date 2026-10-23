/** Owns native database commands, IPC, signals and maintenance until the physical worker process disconnects. */
import { Effect, type Scope } from "effect";
import { makeDuckdbWorkerEffect } from "./duckdb-worker-effect.js";
import { duckdbDriverLayer } from "./duckdb-driver.js";
import { observeDuckdb } from "./duckdb-metrics.js";
import { installDuckdbWorkerIpc } from "./duckdb-worker-ipc.js";
import { installDuckdbWorkerSignals } from "./duckdb-worker-signals.js";
import { installDuckdbWorkerMaintenance } from "./duckdb-worker-maintenance.js";
/** @param scope - Physical process owner. @returns Completion after all scoped resources are registered. */
export const startDuckdbWorkerProcessEffect = Effect.fn("ObservabilityDuckdb.worker.process")(
  function* (scope: Scope.Closeable) {
    return yield* observeDuckdb(
      "worker-process",
      Effect.gen(function* () {
        const worker = yield* Effect.acquireRelease(
          makeDuckdbWorkerEffect().pipe(Effect.provide(duckdbDriverLayer)),
          (owned) => Effect.ignore(owned.close()),
        );
        const state = { opened: false };
        yield* installDuckdbWorkerIpc(worker, state);
        yield* installDuckdbWorkerSignals(scope);
        yield* installDuckdbWorkerMaintenance(worker, state);
      }),
    );
  },
);
