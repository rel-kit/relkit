import { canonicalJson } from "@relkit/contracts";
import { Effect } from "effect";
import { admitObservabilityRecord } from "../record-admission.js";
import type { RedactionPolicy } from "../redaction.js";
import type { PreparedDuckdbRecord } from "./duckdb-batch.types.js";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import { duckdbError } from "./duckdb-error.js";
import { observeDuckdb } from "./duckdb-metrics.js";
import { readDuckdbSql, runDuckdbSql } from "./duckdb-sql.js";
import { recordTime, validateLocalRecord } from "./types.js";
import type { LocalRecord, StoredLocalRecord } from "./types.types.js";

/**
 * Admits and inserts a bounded batch inside the caller's serialized transaction.
 * @param connection - Connection exclusively owned by the transaction permit.
 * @param records - At most 256 transport envelopes, including repeated keys.
 * @param receivedAt - Shared receipt timestamp for the transaction.
 * @param redaction - Admission policy applied before any duplicate is discarded.
 * @returns Inserted records in first-input order with exact allocated cursors.
 * @remarks The caller owns BEGIN, retention, COMMIT and rollback. All inputs are
 * validated, even invalid repeated keys. Receipt RETURNING order and native
 * sequence row order are ignored; explicit BigInt IDs bind records to cursors.
 * Native SQL waits retain the existing interruption-safe connection lifetime.
 * @example
 * const committed = yield* appendDuckdbBatchEffect(connection, records, receivedAt);
 */
export const appendDuckdbBatchEffect = Effect.fn("ObservabilityDuckdb.appendBatch")(
  function* (
    connection: DuckdbConnectionPort,
    records: readonly LocalRecord[],
    receivedAt: number,
    redaction?: RedactionPolicy,
  ) {
    const first = yield* Effect.try({
      try: () => {
        if (records.length > 256)
          throw new RangeError("Telemetry batches contain at most 256 records");
        const values = new Map<string, PreparedDuckdbRecord>();
        for (const item of records) {
          validateLocalRecord(item);
          const safe = admitObservabilityRecord(item.record, redaction);
          if (!safe) throw new TypeError("Telemetry record could not be admitted");
          const payload = canonicalJson(safe);
          if (!values.has(item.key)) values.set(item.key, { item, safe, payload });
        }
        return values;
      },
      catch: (cause) => duckdbError("append", cause),
    });
    if (first.size === 0) return [];
    const receipts = yield* readDuckdbSql(
      connection,
      "append",
      "INSERT INTO receipts VALUES " +
        Array(first.size).fill("(?, ?)").join(", ") +
        " ON CONFLICT DO NOTHING RETURNING key",
      [...first.keys()].flatMap((key) => [key, receivedAt]),
    );
    const admitted = yield* Effect.try({
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
    if (admitted.length === 0) return [];
    const allocated = yield* readDuckdbSql(
      connection,
      "append",
      "SELECT nextval('record_ids')::VARCHAR AS id FROM range(?)",
      [admitted.length],
    );
    const assigned = yield* Effect.try({
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
    const parameters = assigned.flatMap(({ prepared: { item, safe, payload }, cursor }) => [
      BigInt(cursor),
      item.origin,
      safe.signal,
      recordTime(safe),
      receivedAt,
      safe.requestId ?? null,
      safe.originRequestId ?? null,
      safe.traceId ?? null,
      "spanId" in safe ? (safe.spanId ?? null) : null,
      Buffer.byteLength(payload),
      payload,
    ]);
    yield* runDuckdbSql(
      connection,
      "append",
      "INSERT INTO records (id, origin, signal, recorded_at, received_at, request_id, " +
        "origin_request_id, trace_id, span_id, bytes, payload) VALUES " +
        Array(admitted.length).fill("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", "),
      parameters,
    );
    return assigned.map(({ prepared: { item, safe }, cursor }): StoredLocalRecord => ({
      ...safe,
      cursor,
      origin: item.origin,
    }));
  },
  (effect) => observeDuckdb("append-batch", effect),
);
