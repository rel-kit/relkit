import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Context, Effect, Layer, Semaphore } from "effect";
import type { RedactionPolicy } from "../redaction.js";
import type { TelemetryLocalRetentionPolicy } from "../telemetry-config.js";
import type { DuckdbDatabaseEffects } from "./duckdb-database.types.js";
import { DuckdbDriverService } from "./duckdb-driver.js";
import { duckdbError } from "./duckdb-error.js";
import { observeDuckdb } from "./duckdb-metrics.js";
import { makeDuckdbQueryEffect } from "./duckdb-query-effect.js";
import { initializeDuckdbSchema } from "./duckdb-schema.js";
import { makeDuckdbStorage } from "./duckdb-storage.js";
import { importLocalHistoryEffect } from "./import-history-effect.js";
/**
 * Database operations provided for one owned Effect Scope.
 *
 * @example
 * const database = yield* DuckdbDatabaseService;
 * yield* database.flush();
 */
// prettier-ignore
export class DuckdbDatabaseService extends Context.Service<
  DuckdbDatabaseService, DuckdbDatabaseEffects
>()("@relkit/observability/DuckdbDatabase") {}
/**
 * Acquires an instance and connection in the caller's Scope, initializes schema,
 * and returns Effect operations. Scope finalizers close the connection first,
 * then the instance, including on setup failure or interruption.
 *
 * @param root - Private local storage directory.
 * @param configured - Initial retention policy.
 * @param redaction - Initial redaction policy.
 * @returns A scoped database service or a tagged DuckdbError.
 * @example
 * const database = yield* openDuckdbDatabaseEffect(root);
 * yield* database.flush();
 */
export const openDuckdbDatabaseEffect = Effect.fn("ObservabilityDuckdb.open")(function* (
  root: string,
  configured: TelemetryLocalRetentionPolicy = {},
  redaction?: RedactionPolicy,
) {
  return yield* observeDuckdb(
    "open",
    Effect.gen(function* () {
      const driver = yield* DuckdbDriverService;
      yield* Effect.tryPromise({
        try: () => mkdir(root, { recursive: true, mode: 0o700 }),
        catch: (cause) => duckdbError("mkdir", cause),
      });
      const path = join(root, "observability.duckdb");
      const instance = yield* Effect.acquireRelease(driver.create(path), (owned) =>
        Effect.sync(() => owned.closeSync()),
      );
      const connection = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => instance.connect(),
          catch: (cause) => duckdbError("connect", cause),
        }),
        (owned) => Effect.sync(() => owned.closeSync()),
      );
      yield* Effect.tryPromise({
        try: () => chmod(path, 0o600),
        catch: (cause) => duckdbError("chmod", cause),
      });
      yield* initializeDuckdbSchema(connection);
      const permit = yield* Semaphore.make(1);
      const storage = makeDuckdbStorage(connection, permit, configured, redaction);
      const query = makeDuckdbQueryEffect(connection, permit);
      const imported = yield* importLocalHistoryEffect(root, connection, storage.append);
      yield* storage.flush();
      return DuckdbDatabaseService.of({ ...query, ...storage, imported });
    }),
  );
});
/**
 * Provides a scoped database service using an injectable DuckdbDriverService.
 *
 * @param root - Private local storage directory.
 * @param configured - Initial retention policy.
 * @param redaction - Initial redaction policy.
 * @returns A Layer whose scope owns both native DuckDB handles.
 * @example
 * const program = Effect.gen(function* () { return yield* DuckdbDatabaseService; });
 * const layer = duckdbDatabaseLayer(root);
 */
export function duckdbDatabaseLayer(
  root: string,
  configured: TelemetryLocalRetentionPolicy = {},
  redaction?: RedactionPolicy,
) {
  return Layer.effect(DuckdbDatabaseService, openDuckdbDatabaseEffect(root, configured, redaction));
}
