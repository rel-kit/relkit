import { Effect } from "effect";
import type { RedactedObservabilityRecord } from "../record-admission.types.js";
import type { SegmentLine, SegmentScan } from "./index-files.types.js";
import {
  addIndexLineEffect,
  addIndexRecordEffect,
  addIndexSegmentEffect,
  indexMemoryStatsEffect,
  readIndexPageEffect,
  removeIndexEntryEffect,
  renameIndexSegmentEffect,
  trimIndexEntriesEffect,
  type IndexMemoryError,
} from "./index-memory-effect.js";
import type { IndexConfig, IndexState, MutableSegment } from "./index-state.types.js";
import type {
  ObservabilityIndexEntry,
  ObservabilityIndexPage,
  ObservabilityIndexPageOptions,
  ObservabilityIndexStats,
} from "./index.types.js";
export {
  IndexMemoryError,
  addIndexLineEffect,
  addIndexRecordEffect,
  addIndexSegmentEffect,
  indexMemoryStatsEffect,
  readIndexPageEffect,
  removeIndexEntryEffect,
  renameIndexSegmentEffect,
  trimIndexEntriesEffect,
} from "./index-memory-effect.js";
function run<A>(effect: Effect.Effect<A, IndexMemoryError>): A {
  return Effect.runSync(
    effect.pipe(
      Effect.mapError((error) =>
        error.cause instanceof Error ? error.cause : new Error(error.message),
      ),
    ),
  );
}
/**
 * Adds or updates one segment's in-memory metadata.
 * @param state - Mutable index state.
 * @param value - Segment metadata.
 * @returns The mutable segment.
 * @example
 * const segment = addSegment(state, scan);
 */
export function addSegment(state: IndexState, value: SegmentScan): MutableSegment {
  return run(addIndexSegmentEffect(state, value));
}
/**
 * Adds a scanned line to index state.
 * @param state - Mutable index state.
 * @param root - Segment root.
 * @param line - Scanned record and byte location.
 * @returns Nothing after insertion.
 * @throws {TypeError} If the line location is invalid.
 * @example
 * addLine(state, root, line);
 */
export function addLine(state: IndexState, root: string, line: SegmentLine): void {
  return run(addIndexLineEffect(state, root, line));
}
/**
 * Adds or replaces one record at a segment location.
 * @param state - Mutable index state.
 * @param root - Segment root.
 * @param record - Admitted record.
 * @param path - Absolute segment path.
 * @param offset - Byte offset.
 * @param bytes - Byte length.
 * @param countBytes - Whether to add bytes to segment totals.
 * @returns The new entry.
 * @throws {TypeError} If the record or byte location is invalid.
 * @example
 * const entry = addRecord(state, root, record, path, 0, 10);
 */
export function addRecord(
  state: IndexState,
  root: string,
  record: RedactedObservabilityRecord,
  path: string,
  offset: number,
  bytes: number,
  countBytes = true,
): ObservabilityIndexEntry {
  return run(addIndexRecordEffect(state, root, record, path, offset, bytes, countBytes));
}
/**
 * Updates in-memory paths after segment finalization.
 * @param state - Mutable index state.
 * @param root - Segment root.
 * @param activePath - Former active path.
 * @param finalPath - Finalized path.
 * @returns Nothing after renaming.
 * @example
 * renameSegment(state, root, active, final);
 */
export function renameSegment(
  state: IndexState,
  root: string,
  activePath: string,
  finalPath: string,
): void {
  return run(renameIndexSegmentEffect(state, root, activePath, finalPath));
}
/**
 * Reads one filtered page from in-memory entries.
 * @param state - Current index state.
 * @param config - Page settings.
 * @param options - Cursor and filters.
 * @returns One immutable page.
 * @throws {TypeError} If a cursor or limit is invalid.
 * @example
 * const page = readPage(state, config, { limit: 10 });
 */
export function readPage(
  state: IndexState,
  config: IndexConfig,
  options: ObservabilityIndexPageOptions,
): ObservabilityIndexPage {
  return run(readIndexPageEffect(state, config, options));
}
/**
 * Removes one entry and its field indexes.
 * @param state - Mutable index state.
 * @param root - Segment root.
 * @param cursor - Entry cursor.
 * @returns Nothing after removal.
 * @example
 * removeEntry(state, root, "1");
 */
export function removeEntry(state: IndexState, root: string, cursor: string): void {
  return run(removeIndexEntryEffect(state, root, cursor));
}
/**
 * Drops the oldest entries until the bound is met.
 * @param state - Mutable index state.
 * @param root - Segment root.
 * @param maxEntries - Maximum retained entries.
 * @returns Nothing after trimming.
 * @example
 * trimEntries(state, root, 100);
 */
export function trimEntries(state: IndexState, root: string, maxEntries: number): void {
  return run(trimIndexEntriesEffect(state, root, maxEntries));
}
/**
 * Summarizes in-memory records and segments.
 * @param state - Current index state.
 * @returns Record, segment, and byte counts.
 * @example
 * const totals = stats(state);
 */
export function stats(state: IndexState): ObservabilityIndexStats {
  return run(indexMemoryStatsEffect(state));
}
