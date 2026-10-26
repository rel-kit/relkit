/** Composes validated receipt admission, explicit cursor allocation and insertion within one borrowed transaction. */
import { Effect } from "effect";
import type { RedactionPolicy } from "@relkit/observability";
import type { LocalRecord } from "@relkit/observability/local/record";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import { prepareDuckdbBatch } from "./duckdb-batch-prepare.js";
import { admitDuckdbReceipts } from "./duckdb-batch-receipts.js";
import { assignDuckdbCursors } from "./duckdb-batch-cursors.js";
import { insertDuckdbBatch } from "./duckdb-batch-insert.js";
import { observeDuckdb } from "./duckdb-metrics.js";
/** @param connection - Transaction-owned connection. @param records - At most 256 envelopes. @param receivedAt - Batch epoch milliseconds. @param redaction - Admission policy. @returns Explicitly cursored stored records; caller commits or rolls back. */
export const appendDuckdbBatchEffect = Effect.fn("ObservabilityDuckdb.appendBatch")(
  function* (
    connection: DuckdbConnectionPort,
    records: readonly LocalRecord[],
    receivedAt: number,
    redaction?: RedactionPolicy,
  ) {
    const first = yield* prepareDuckdbBatch(records, redaction);
    if (first.size === 0) return [];
    const admitted = yield* admitDuckdbReceipts(connection, first, receivedAt);
    if (admitted.length === 0) return [];
    const assigned = yield* assignDuckdbCursors(connection, admitted);
    return yield* insertDuckdbBatch(connection, assigned, receivedAt);
  },
  (effect) => observeDuckdb("append-batch", effect),
);
