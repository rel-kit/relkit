import { canonicalJson } from "@relkit/contracts";
import { Clock, Effect, Exit, Semaphore } from "effect";
import { admitObservabilityRecord } from "../record-admission.js";
import type { RedactionPolicy } from "../redaction.js";
import type { TelemetryLocalRetentionPolicy } from "../telemetry-config.js";
import { duckdbError } from "./duckdb-error.js";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import { observeDuckdb } from "./duckdb-metrics.js";
import { readDuckdbSql, runDuckdbSql } from "./duckdb-sql.js";
import type { DuckdbStorageEffects } from "./duckdb-storage.types.js";
import { recordTime, validateLocalRecord } from "./types.js";
import type { LocalRecord, StoredLocalRecord } from "./types.types.js";
/**
 * Creates serialized Effect operations over one scoped DuckDB connection.
 *
 * @param connection - Connection owned by the database Scope.
 * @param permit - Shared semaphore for writes and queries.
 * @param configured - Initial retention limits.
 * @param initialRedaction - Initial admission policy.
 * @returns Append, retention, configuration, and flush Effects.
 * @example
 * const storage = makeDuckdbStorage(connection, permit, {});
 * yield* storage.flush();
 */
export function makeDuckdbStorage(
  connection: DuckdbConnectionPort,
  permit: Semaphore.Semaphore,
  configured: TelemetryLocalRetentionPolicy,
  initialRedaction?: RedactionPolicy,
): DuckdbStorageEffects {
  let retention = configured;
  let redaction = initialRedaction;
  const retain = Effect.fn("ObservabilityDuckdb.retain")(function* () {
    return yield* observeDuckdb(
      "retain",
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const age = retention.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
        const maximum = retention.maxBytes ?? 256 * 1024 * 1024;
        const entries = retention.maxEntries ?? Number.MAX_SAFE_INTEGER;
        yield* runDuckdbSql(connection, "retain", "DELETE FROM records WHERE recorded_at < ?", [
          now - age,
        ]);
        yield* runDuckdbSql(
          connection,
          "retain",
          `DELETE FROM records WHERE id IN (
        SELECT id FROM (SELECT id, sum(bytes) OVER (ORDER BY id DESC) AS total,
        row_number() OVER (ORDER BY id DESC) AS position FROM records) WHERE total > ? OR position > ?
      )`,
          [maximum, entries],
        );
        yield* runDuckdbSql(
          connection,
          "retain",
          "DELETE FROM receipts WHERE received_at < ? AND NOT starts_with(key, 'legacy:')",
          [now - 7 * 24 * 60 * 60 * 1000],
        );
      }),
    );
  });
  const append = Effect.fn("ObservabilityDuckdb.append")(function* (
    records: readonly LocalRecord[],
  ) {
    return yield* observeDuckdb(
      "append",
      permit.withPermit(
        Effect.gen(function* () {
          if (records.length > 256)
            return yield* Effect.fail(
              duckdbError(
                "append",
                new RangeError("Telemetry batches contain at most 256 records"),
              ),
            );
          const committed: StoredLocalRecord[] = [];
          const receivedAt = yield* Clock.currentTimeMillis;
          yield* Effect.acquireUseRelease(
            runDuckdbSql(connection, "begin", "BEGIN TRANSACTION"),
            () =>
              Effect.gen(function* () {
                for (const item of records) {
                  const prepared = yield* Effect.try({
                    try: () => {
                      validateLocalRecord(item);
                      const safe = admitObservabilityRecord(item.record, redaction);
                      if (!safe) throw new TypeError("Telemetry record could not be admitted");
                      return { safe, payload: canonicalJson(safe) };
                    },
                    catch: (cause) => duckdbError("append", cause),
                  });
                  const receipt = yield* readDuckdbSql(
                    connection,
                    "append",
                    "INSERT INTO receipts VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING key",
                    [item.key, receivedAt],
                  );
                  if (receipt.getRowObjectsJson().length === 0) continue;
                  const result = yield* readDuckdbSql(
                    connection,
                    "append",
                    `INSERT INTO records
              (origin, signal, recorded_at, received_at, request_id, origin_request_id, trace_id, span_id, bytes, payload)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id::VARCHAR AS id`,
                    [
                      item.origin,
                      prepared.safe.signal,
                      recordTime(prepared.safe),
                      receivedAt,
                      prepared.safe.requestId ?? null,
                      prepared.safe.originRequestId ?? null,
                      prepared.safe.traceId ?? null,
                      "spanId" in prepared.safe ? (prepared.safe.spanId ?? null) : null,
                      Buffer.byteLength(prepared.payload),
                      prepared.payload,
                    ],
                  );
                  committed.push({
                    ...prepared.safe,
                    cursor: String(result.getRowObjectsJson()[0]?.id),
                    origin: item.origin,
                  });
                }
                yield* retain();
                return committed;
              }),
            (_begin, exit) =>
              Exit.isSuccess(exit)
                ? runDuckdbSql(connection, "commit", "COMMIT").pipe(
                    Effect.catchTag("DuckdbError", (failure) =>
                      runDuckdbSql(connection, "rollback", "ROLLBACK").pipe(
                        Effect.ignore,
                        Effect.flatMap(() => Effect.fail(failure)),
                      ),
                    ),
                    Effect.asVoid,
                  )
                : runDuckdbSql(connection, "rollback", "ROLLBACK").pipe(Effect.ignore),
          );
          return committed;
        }),
      ),
    );
  });
  const configure = Effect.fn("ObservabilityDuckdb.configure")(function* (
    value: TelemetryLocalRetentionPolicy,
    nextRedaction?: RedactionPolicy,
  ) {
    yield* observeDuckdb(
      "configure",
      permit.withPermit(
        Effect.gen(function* () {
          retention = value;
          redaction = nextRedaction;
          yield* retain();
          yield* runDuckdbSql(connection, "checkpoint", "CHECKPOINT");
        }),
      ),
    );
  });
  const flush = Effect.fn("ObservabilityDuckdb.flush")(function* () {
    yield* observeDuckdb(
      "flush",
      permit.withPermit(
        Effect.gen(function* () {
          yield* retain();
          yield* runDuckdbSql(connection, "checkpoint", "CHECKPOINT");
        }),
      ),
    );
  });
  return { append, configure, flush };
}
