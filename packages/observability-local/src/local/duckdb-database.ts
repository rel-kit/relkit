/**
 * Owns duckdb database for the optional local history store.
 * Shared records and query contracts come from lightweight observability; native
 * handles and worker lifetimes remain owned by this storage package.
 */
import { Effect, Exit, Scope } from "effect";
import type { RedactionPolicy } from "@relkit/observability";
import type { TelemetryLocalRetentionPolicy } from "@relkit/observability";
import { openDuckdbDatabaseEffect } from "./duckdb-database-effect.js";
import { duckdbDriverLayer } from "./duckdb-driver.js";
import { duckdbError } from "./duckdb-error.js";
import { DuckdbQueryError } from "./duckdb-query-error.js";
import { ObservabilityQueryError } from "@relkit/observability";
/**
 * Opens a private DuckDB database and owns its Effect Scope until close.
 * The scoped Effect implementation contains acquisition and operation logic.
 *
 * @param root - Directory containing the local database file.
 * @param configured - Initial retention policy.
 * @param redaction - Initial redaction policy.
 * @returns A live Promise API with append, query, configure, flush, and close.
 * @throws {DuckdbError} If acquisition, storage, or import fails.
 * @example
 * const database = await openDuckdbDatabase(root);
 * await database.close();
 */
export async function openDuckdbDatabase(
  root: string,
  configured: TelemetryLocalRetentionPolicy = {},
  redaction?: RedactionPolicy,
) {
  const scope = Effect.runSync(Scope.make());
  try {
    const database = await Effect.runPromise(
      openDuckdbDatabaseEffect(root, configured, redaction).pipe(
        Scope.provide(scope),
        Effect.provide(duckdbDriverLayer),
      ),
    );
    let closing = false;
    const run = <A, E>(operation: Effect.Effect<A, E>): Promise<A> =>
      closing
        ? Promise.reject(duckdbError("closed", new Error("Telemetry database is closed")))
        : runDirect(operation);
    let closePromise: Promise<void> | undefined;
    return {
      imported: database.imported,
      append: (records: Parameters<typeof database.append>[0]) => run(database.append(records)),
      list: (
        kind: Parameters<typeof database.list>[0],
        input?: Parameters<typeof database.list>[1],
      ) => run(database.list(kind, input)),
      detail: (kind: Parameters<typeof database.detail>[0], id: string) =>
        run(database.detail(kind, id)),
      configure: (value: TelemetryLocalRetentionPolicy, nextRedaction?: RedactionPolicy) =>
        run(database.configure(value, nextRedaction)),
      flush: () => run(database.flush()),
      close: () =>
        (closePromise ??= (async () => {
          closing = true;
          try {
            await runDirect(database.flush());
          } finally {
            await Effect.runPromise(Scope.close(scope, Exit.void));
          }
        })()),
    };
  } catch (error) {
    await Effect.runPromise(Scope.close(scope, Exit.fail(error))).catch(() => undefined);
    throw error;
  }
}

/** @typeParam A - Native success value. @typeParam E - Native failure. @param operation - Lazy database operation. @returns Promise preserving public query error identity. */
const runDirect = <A, E>(operation: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(
    operation.pipe(
      Effect.mapError((error) =>
        error instanceof DuckdbQueryError
          ? new ObservabilityQueryError(error.code, error.message)
          : error,
      ),
    ),
  );
