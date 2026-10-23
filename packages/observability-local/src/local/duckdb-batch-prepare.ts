/** Validates every envelope before receipt deduplication and encodes only admitted redacted payloads. */
import { canonicalJson } from "@relkit/contracts";
import { admitObservabilityRecord } from "@relkit/observability";
import type { RedactionPolicy } from "@relkit/observability";
import { validateLocalRecord } from "@relkit/observability/local/record";
import type { LocalRecord } from "@relkit/observability/local/record";
import { Effect } from "effect";
import { duckdbError } from "./duckdb-error.js";
import { readDuckdbSql } from "./duckdb-sql.js";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import type { PreparedDuckdbRecord, AssignedDuckdbRecord } from "./duckdb-batch.types.js";
/** @param records - Input envelopes, including repeated keys. @param redaction - Current admission policy. @returns First envelope per key after all validation. */
export const prepareDuckdbBatch = Effect.fn("ObservabilityDuckdb.batch.prepare")(function* (
  records: readonly LocalRecord[],
  redaction?: RedactionPolicy,
) {
  return yield* Effect.try({
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
});
