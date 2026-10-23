/** Applies the existing history/receipt retention policy inside the caller's database permit. */
import { Clock, Effect } from "effect";
import { observeDuckdb } from "./duckdb-metrics.js";
import { runDuckdbSql } from "./duckdb-sql.js";
import type { DuckdbStorageState } from "./duckdb-storage-state.types.js";
/** @param state - Store-owned connection and policy. @returns Typed retention completion; no database is acquired here. */
export const retainDuckdbRecords = Effect.fn("ObservabilityDuckdb.retain")(function* (
  state: DuckdbStorageState,
) {
  return yield* observeDuckdb(
    "retain",
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const age = state.retention.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
      const maximum = state.retention.maxBytes ?? 256 * 1024 * 1024;
      const entries = state.retention.maxEntries ?? Number.MAX_SAFE_INTEGER;
      yield* runDuckdbSql(state.connection, "retain", "DELETE FROM records WHERE recorded_at < ?", [
        now - age,
      ]);
      yield* runDuckdbSql(
        state.connection,
        "retain",
        `DELETE FROM records WHERE id IN (
        SELECT id FROM (SELECT id, sum(bytes) OVER (ORDER BY id DESC) AS total,
        row_number() OVER (ORDER BY id DESC) AS position FROM records) WHERE total > ? OR position > ?
      )`,
        [maximum, entries],
      );
      yield* runDuckdbSql(
        state.connection,
        "retain",
        "DELETE FROM receipts WHERE received_at < ? AND NOT starts_with(key, 'legacy:')",
        [now - 7 * 24 * 60 * 60 * 1000],
      );
    }),
  );
});
