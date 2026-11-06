/** Inserts stable transport receipts transactionally and recovers first-input ordering from returned keys. */
import { Effect } from "effect";
import { duckdbError } from "./duckdb-error.js";
import { readDuckdbSql } from "./duckdb-sql.js";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import type { PreparedDuckdbRecord, AssignedDuckdbRecord } from "./duckdb-batch.types.js";
/** @param connection - Transaction-owned connection. @param first - Validated first envelopes. @param receivedAt - Receipt epoch milliseconds. @returns Newly admitted records in input order. */
export const admitDuckdbReceipts = Effect.fn("ObservabilityDuckdb.batch.receipts")(function* (
  connection: DuckdbConnectionPort,
  first: Map<string, PreparedDuckdbRecord>,
  receivedAt: number,
) {
  const receipts = yield* readDuckdbSql(
    connection,
    "append",
    "INSERT INTO receipts VALUES " +
      Array(first.size).fill("(?, ?)").join(", ") +
      " ON CONFLICT DO NOTHING RETURNING key",
    [...first.keys()].flatMap((key) => [key, receivedAt]),
  );
  return yield* Effect.try({
    try: () => {
      const keys = new Set<string>();
      for (const row of receipts.getRowObjectsJson()) {
        const key = row["key"];
        if (typeof key !== "string" || !first.has(key) || keys.has(key))
          throw new Error("Unexpected receipt admission result");
        keys.add(key);
      }
      return [...first.values()].filter(({ item }) => keys.has(item.key));
    },
    catch: (cause) => duckdbError("append", cause),
  });
});
