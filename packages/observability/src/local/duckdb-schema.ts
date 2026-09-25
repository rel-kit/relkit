import { Effect } from "effect";
import { duckdbError } from "./duckdb-error.js";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import { readDuckdbSql, runDuckdbSql } from "./duckdb-sql.js";
/**
 * Initializes the local observability schema and checks compatibility.
 *
 * @param connection - Connection owned by the open database Scope.
 * @returns An Effect completing after schema validation or a tagged error.
 * @example
 * yield* initializeDuckdbSchema(connection);
 */
export const initializeDuckdbSchema = Effect.fn("ObservabilityDuckdb.schema")(function* (
  connection: DuckdbConnectionPort,
) {
  yield* runDuckdbSql(
    connection,
    "schema",
    `
    CREATE SEQUENCE IF NOT EXISTS record_ids;
    CREATE TABLE IF NOT EXISTS records (
      id BIGINT PRIMARY KEY DEFAULT nextval('record_ids'), origin VARCHAR NOT NULL,
      signal VARCHAR NOT NULL, recorded_at BIGINT NOT NULL, received_at BIGINT NOT NULL,
      request_id VARCHAR, origin_request_id VARCHAR, trace_id VARCHAR, span_id VARCHAR,
      bytes BIGINT NOT NULL, payload JSON NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipts (key VARCHAR PRIMARY KEY, received_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS imports (source VARCHAR PRIMARY KEY, malformed BIGINT NOT NULL);
    CREATE INDEX IF NOT EXISTS records_trace ON records(trace_id);
    CREATE INDEX IF NOT EXISTS records_request ON records(request_id);
    CREATE INDEX IF NOT EXISTS records_origin_request ON records(origin_request_id);
    CREATE INDEX IF NOT EXISTS records_span ON records(trace_id, span_id);
  `,
  );
  const result = yield* readDuckdbSql(
    connection,
    "schema",
    "SELECT name FROM pragma_table_info('records')",
  );
  const columns = result.getRowObjectsJson().map((row) => String(row.name));
  for (const required of ["origin_request_id", "span_id"])
    if (!columns.includes(required))
      return yield* Effect.fail(
        duckdbError(
          "schema",
          new Error("RELKIT_OBSERVABILITY_STATE_INCOMPATIBLE: use fresh development state"),
        ),
      );
});
