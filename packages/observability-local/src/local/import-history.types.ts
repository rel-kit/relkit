/**
 * Owns import history.types for the optional local history store.
 * Shared records and query contracts come from lightweight observability; native
 * handles and worker lifetimes remain owned by this storage package.
 */
import type { Effect } from "effect";
import type { DuckdbError } from "./duckdb-error.js";
import type { LocalRecord, StoredLocalRecord } from "@relkit/observability/local/record";

/**
 * Counts persisted and malformed legacy segment records.
 *
 * @example
 * const summary: LegacyImportSummary = { records: 2, malformed: 1 };
 */
export interface LegacyImportSummary {
  readonly records: number;
  readonly malformed: number;
}

/**
 * Effect batch writer used during the ordered legacy import.
 *
 * @param records - At most 256 validated legacy envelopes.
 * @returns An Effect with committed records or a tagged DuckdbError.
 * @example
 * const append: LegacyAppend = (records) => storage.append(records);
 */
export type LegacyAppend = (
  records: readonly LocalRecord[],
) => Effect.Effect<readonly StoredLocalRecord[], DuckdbError>;
