/** Decodes native JSON rows into validated diagnostic records under the shared database permit. */
import type { DuckDBValue } from "@duckdb/node-api";
import { Effect, Semaphore } from "effect";
import { validateLocalRecord } from "@relkit/observability/local/record";
import type { StoredLocalRecord } from "@relkit/observability/local/record";
import { duckdbError } from "./duckdb-error.js";
import { readDuckdbSql } from "./duckdb-sql.js";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
/** @param connection - Scoped native connection. @param permit - Database serialization. @returns The validated row reader. */
export function makeDuckdbRows(connection: DuckdbConnectionPort, permit: Semaphore.Semaphore) {
  return Effect.fn("ObservabilityDuckdb.rows")(function* (sql: string, values: DuckDBValue[] = []) {
    const result = yield* permit.withPermit(readDuckdbSql(connection, "query", sql, values));
    return yield* Effect.try({
      try: (): StoredLocalRecord[] =>
        result.getRowObjectsJson().map((item) => {
          const envelope = {
            key: `read:${String(item.cursor)}`,
            origin: item.origin,
            record: JSON.parse(String(item.payload)),
          };
          validateLocalRecord(envelope);
          return { ...envelope.record, cursor: String(item.cursor), origin: envelope.origin };
        }),
      catch: (cause) => duckdbError("decode", cause),
    });
  });
}
