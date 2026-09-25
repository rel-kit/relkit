import { Context, Effect, Exit, Layer, Scope, Semaphore } from "effect";
import { openDuckdbDatabaseEffect } from "./duckdb-database-effect.js";
import type { DuckdbDatabaseEffects } from "./duckdb-database.types.js";
import { DuckdbDriverService } from "./duckdb-driver.js";
import { duckdbError } from "./duckdb-error.js";
import { observeDuckdb } from "./duckdb-metrics.js";
import type { DuckdbWorkerEffects } from "./duckdb-worker.types.js";
import type { LocalWorkerCommand } from "./types.types.js";
/**
 * Substitutable serial command executor for the DuckDB worker process.
 *
 * @example
 * const worker = yield* DuckdbWorkerService;
 * yield* worker.execute({ type: "flush" });
 */
// prettier-ignore
export class DuckdbWorkerService extends Context.Service<DuckdbWorkerService, DuckdbWorkerEffects>()(
  "@relkit/observability/DuckdbWorker",
) {}
/**
 * Creates a worker command service under an owning Effect Scope.
 * Each open command creates a Scope retained until close or worker release.
 *
 * @returns A serialized worker service or a tagged database error.
 * @example
 * const worker = yield* makeDuckdbWorkerEffect();
 * yield* worker.execute({ type: "open", root });
 */
export const makeDuckdbWorkerEffect = Effect.fn("ObservabilityDuckdb.worker.create")(function* () {
  const driver = yield* DuckdbDriverService;
  const permit = yield* Semaphore.make(1);
  let database: DuckdbDatabaseEffects | undefined;
  let databaseScope: Scope.Closeable | undefined;
  const closeDatabase = Effect.fn("ObservabilityDuckdb.worker.closeDatabase")(function* () {
    const current = database;
    const scope = databaseScope;
    database = undefined;
    databaseScope = undefined;
    if (current === undefined || scope === undefined) return;
    yield* current.flush().pipe(Effect.ensuring(Scope.close(scope, Exit.void)));
  });
  const execute = Effect.fn("ObservabilityDuckdb.worker.execute")(function* (
    command: LocalWorkerCommand,
  ) {
    return yield* observeDuckdb(
      "worker-command",
      permit.withPermit(
        Effect.gen(function* () {
          if (command.type === "open") {
            if (database !== undefined)
              return yield* Effect.fail(
                duckdbError("open", new Error("Telemetry database is already open")),
              );
            return yield* Effect.uninterruptible(
              Effect.gen(function* () {
                const scope = yield* Scope.make();
                const acquired = yield* openDuckdbDatabaseEffect(
                  command.root,
                  command.retention,
                  command.redaction,
                ).pipe(
                  Scope.provide(scope),
                  Effect.provideService(DuckdbDriverService, driver),
                  Effect.onExit((exit) =>
                    Exit.isSuccess(exit) ? Effect.void : Scope.close(scope, exit),
                  ),
                );
                database = acquired;
                databaseScope = scope;
                return acquired.imported;
              }),
            );
          }
          if (database === undefined)
            return yield* Effect.fail(
              duckdbError("command", new Error("Telemetry database is not open")),
            );
          switch (command.type) {
            case "append":
              return yield* database.append(command.records);
            case "query":
              return yield* database.list(command.kind, command.query);
            case "detail":
              return yield* database.detail(command.kind, command.id);
            case "retention":
              return yield* database.configure(command.retention, command.redaction);
            case "flush":
              return yield* database.flush();
            case "close":
              return yield* closeDatabase();
          }
        }),
      ),
    );
  });
  const close = Effect.fn("ObservabilityDuckdb.worker.close")(function* () {
    yield* permit.withPermit(closeDatabase());
  });
  return DuckdbWorkerService.of({ execute, close });
});
/**
 * Acquires a command service for a Layer Scope and releases any open database.
 *
 * @returns A Layer requiring an injectable DuckdbDriverService.
 * @example
 * const program = Effect.gen(function* () { return yield* DuckdbWorkerService; });
 * const layer = duckdbWorkerLayer;
 */
export const duckdbWorkerLayer = Layer.effect(
  DuckdbWorkerService,
  Effect.acquireRelease(makeDuckdbWorkerEffect(), (worker) => Effect.ignore(worker.close())),
);
