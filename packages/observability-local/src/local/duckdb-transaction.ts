/** Commits one validated idempotent batch and retention atomically; failures retain rollback behavior. */
import { Clock, Effect, Exit } from "effect";
import type { LocalRecord, StoredLocalRecord } from "@relkit/observability/local/record";
import { appendDuckdbBatchEffect } from "./duckdb-batch.js";
import { retainDuckdbRecords } from "./duckdb-retention.js";
import { runDuckdbSql } from "./duckdb-sql.js";
import { duckdbError } from "./duckdb-error.js";
import { observeDuckdb } from "./duckdb-metrics.js";
import type { DuckdbStorageState } from "./duckdb-storage-state.types.js";
/** @param state - Serialized store owner. @param records - At most 256 envelopes. @returns Committed stored records or typed native failure. */
export const appendDuckdbRecords = Effect.fn("ObservabilityDuckdb.append")(function* (
  state: DuckdbStorageState,
  records: readonly LocalRecord[],
) {
  return yield* observeDuckdb(
    "append",
    state.permit.withPermit(
      Effect.gen(function* () {
        if (records.length > 256)
          return yield* Effect.fail(
            duckdbError("append", new RangeError("Telemetry batches contain at most 256 records")),
          );
        let committed: StoredLocalRecord[] = [];
        const receivedAt = yield* Clock.currentTimeMillis;
        yield* Effect.acquireUseRelease(
          runDuckdbSql(state.connection, "begin", "BEGIN TRANSACTION"),
          () =>
            Effect.gen(function* () {
              committed = yield* appendDuckdbBatchEffect(
                state.connection,
                records,
                receivedAt,
                state.redaction,
              );
              yield* retainDuckdbRecords(state);
              return committed;
            }),
          (_begin, exit) =>
            Exit.isSuccess(exit)
              ? runDuckdbSql(state.connection, "commit", "COMMIT").pipe(
                  Effect.catchTag("DuckdbError", (failure) =>
                    runDuckdbSql(state.connection, "rollback", "ROLLBACK").pipe(
                      Effect.ignore,
                      Effect.flatMap(() => Effect.fail(failure)),
                    ),
                  ),
                  Effect.asVoid,
                )
              : runDuckdbSql(state.connection, "rollback", "ROLLBACK").pipe(Effect.ignore),
        );
        return committed;
      }),
    ),
  );
});
