import type { DuckDBValue } from "@duckdb/node-api";
import { Effect } from "effect";
import { duckdbError } from "./duckdb-error.js";
import type { DuckdbConnectionPort, DuckdbRows } from "./duckdb-driver.types.js";
/**
 * Runs one native SQL command without closing its connection during interruption.
 * DuckDB's Promise API has no cancellation signal, so interruption waits for
 * the native command to settle before Scope finalizers release the handles.
 *
 * @param connection - Scoped DuckDB connection.
 * @param operation - Stable label for a typed failure.
 * @param sql - SQL statement.
 * @param values - Bound values.
 * @returns An Effect completing after the native command or a DuckdbError.
 * @example
 * yield* runDuckdbSql(connection, "checkpoint", "CHECKPOINT");
 */
export const runDuckdbSql = Effect.fn("ObservabilityDuckdb.sql.run")(
  (connection: DuckdbConnectionPort, operation: string, sql: string, values?: DuckDBValue[]) =>
    Effect.uninterruptible(
      Effect.tryPromise({
        try: () => connection.run(sql, values),
        catch: (cause) => duckdbError(operation, cause),
      }),
    ),
);
/**
 * Reads rows from one native SQL command under the owning connection Scope.
 *
 * @param connection - Scoped DuckDB connection.
 * @param operation - Stable label for a typed failure.
 * @param sql - SQL query.
 * @param values - Bound values.
 * @returns An Effect with a completed row reader or a DuckdbError.
 * @example
 * const result = yield* readDuckdbSql(connection, "schema", "SELECT 1");
 */
export const readDuckdbSql = Effect.fn("ObservabilityDuckdb.sql.read")(
  (
    connection: DuckdbConnectionPort,
    operation: string,
    sql: string,
    values?: DuckDBValue[],
  ): Effect.Effect<DuckdbRows, ReturnType<typeof duckdbError>> =>
    Effect.uninterruptible(
      Effect.tryPromise({
        try: () => connection.runAndReadAll(sql, values),
        catch: (cause) => duckdbError(operation, cause),
      }),
    ),
);
