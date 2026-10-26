/**
 * Composes serialized storage commands behind an injectable worker service.
 * Its scope owns the explicit database scope until close, failure or interruption.
 */
import { Context, Effect, Layer, Semaphore } from "effect";
import { DuckdbDriverService } from "./duckdb-driver.js";
import { observeDuckdb } from "./duckdb-metrics.js";
import { closeDuckdbWorkerDatabase, executeDuckdbWorkerCommand } from "./duckdb-worker-database.js";
import type { DuckdbWorkerEffects } from "./duckdb-worker.types.js";
import type { DuckdbWorkerState } from "./duckdb-worker-state.types.js";
import type { LocalWorkerCommand } from "@relkit/observability/local/record";

/** Injectable command executor whose owner must close its database. */
export class DuckdbWorkerService extends Context.Service<
  DuckdbWorkerService,
  DuckdbWorkerEffects
>()("@relkit/observability/DuckdbWorker", { make: () => makeDuckdbWorkerEffect() }) {}

/** @returns Lazy command service requiring the explicit native driver. */
export const makeDuckdbWorkerEffect = Effect.fn("ObservabilityDuckdb.worker.create")(function* () {
  const driver = yield* DuckdbDriverService;
  const permit = yield* Semaphore.make(1);
  const state: DuckdbWorkerState = {
    driver,
    permit,
    database: undefined,
    databaseScope: undefined,
  };
  return {
    execute: Effect.fn("ObservabilityDuckdb.worker.execute")((command: LocalWorkerCommand) =>
      observeDuckdb(
        "worker-command",
        permit.withPermit(executeDuckdbWorkerCommand(state, command)),
      ),
    ),
    close: Effect.fn("ObservabilityDuckdb.worker.close")(() =>
      permit.withPermit(closeDuckdbWorkerDatabase(state)),
    ),
  } satisfies DuckdbWorkerEffects;
});

/** Owns the command service and releases native state on every scope exit. */
export const duckdbWorkerLayer = Layer.effect(
  DuckdbWorkerService,
  Effect.acquireRelease(DuckdbWorkerService.make(), (worker) => Effect.ignore(worker.close())),
);
