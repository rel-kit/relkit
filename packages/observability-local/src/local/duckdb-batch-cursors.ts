/** Assigns explicit monotonically ordered cursors without relying on native sequence row order. */
import { Effect } from "effect";
import { duckdbError } from "./duckdb-error.js";
import { readDuckdbSql } from "./duckdb-sql.js";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import type { PreparedDuckdbRecord, AssignedDuckdbRecord } from "./duckdb-batch.types.js";
/** @param connection - Transaction-owned connection. @param admitted - Newly receipted records. @returns A proven one-to-one cursor assignment. */
export const assignDuckdbCursors = Effect.fn("ObservabilityDuckdb.batch.cursors")(function* (
  connection: DuckdbConnectionPort,
  admitted: PreparedDuckdbRecord[],
) {
  const allocated = yield* readDuckdbSql(
    connection,
    "append",
    "SELECT nextval('record_ids')::VARCHAR AS id FROM range(?)",
    [admitted.length],
  );
  return yield* Effect.try({
    try: () => {
      const values: string[] = [];
      for (const row of allocated.getRowObjectsJson()) {
        const value = row["id"];
        if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value))
          throw new Error("Unexpected cursor allocation result");
        values.push(value);
      }
      if (values.length !== admitted.length || new Set(values).size !== values.length)
        throw new Error("Unexpected cursor allocation result");
      values.sort((left, right) => (BigInt(left) < BigInt(right) ? -1 : 1));
      return admitted.map((prepared, index) => {
        const cursor = values[index];
        if (cursor === undefined) throw new Error("Unexpected cursor allocation result");
        return { prepared, cursor };
      });
    },
    catch: (cause) => duckdbError("append", cause),
  });
});
