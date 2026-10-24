/** Writes explicitly assigned cursor/payload rows inside the caller's atomic batch transaction. */
import { Effect } from "effect";
import { recordTime } from "@relkit/observability/local/record";
import type { StoredLocalRecord } from "@relkit/observability/local/record";
import { runDuckdbSql } from "./duckdb-sql.js";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import type { AssignedDuckdbRecord } from "./duckdb-batch.types.js";
/** @param connection - Transaction-owned connection. @param assigned - Explicit record/cursor pairs. @param receivedAt - Batch epoch milliseconds. @returns Stored envelopes after the native insert. */
export const insertDuckdbBatch = Effect.fn("ObservabilityDuckdb.batch.insert")(function* (
  connection: DuckdbConnectionPort,
  assigned: readonly AssignedDuckdbRecord[],
  receivedAt: number,
) {
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
      Array(assigned.length).fill("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", "),
    parameters,
  );
  return assigned.map(({ prepared: { item, safe }, cursor }): StoredLocalRecord => ({
    ...safe,
    cursor,
    origin: item.origin,
  }));
});
