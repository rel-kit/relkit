/**
 * Owns duckdb batch.types for the optional local history store.
 * Shared records and query contracts come from lightweight observability; native
 * handles and worker lifetimes remain owned by this storage package.
 */
import type { ObservabilityRecord } from "@relkit/observability";
import type { LocalRecord } from "@relkit/observability/local/record";

/** Validated and redacted envelope retained until its transaction commits. */
export interface PreparedDuckdbRecord {
  readonly item: LocalRecord;
  readonly safe: ObservabilityRecord;
  readonly payload: string;
}

/** Cursor assignment validated before inserting the record payload. */
export interface AssignedDuckdbRecord {
  readonly prepared: PreparedDuckdbRecord;
  readonly cursor: string;
}
