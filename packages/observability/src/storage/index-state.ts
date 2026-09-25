import { Effect } from "effect";
import type { ObservabilityRecord } from "../model.js";
import type {
  ObservabilityIndexEntry,
  ObservabilityIndexOptions,
  ObservabilityIndexPageOptions,
} from "./index.types.js";
import {
  assertIndexEntryEffect,
  boundedIndexLimitEffect,
  createIndexStateEffect,
  indexTimestampEffect,
  makeIndexEntryEffect,
  matchesIndexEntryEffect,
  normalizeIndexOptionsEffect,
  optionalIndexTextEffect,
  parseIndexCursorEffect,
  safeIndexSegmentPathEffect,
  timestampMsEffect,
  type IndexStateError,
} from "./index-state-effect.js";
import type { IndexConfig, IndexState } from "./index-state.types.js";
export type { IndexConfig, IndexState, MutableSegment } from "./index-state.types.js";
export {
  IndexStateError,
  assertIndexEntryEffect,
  boundedIndexLimitEffect,
  createIndexStateEffect,
  indexTimestampEffect,
  makeIndexEntryEffect,
  matchesIndexEntryEffect,
  normalizeIndexOptionsEffect,
  optionalIndexTextEffect,
  parseIndexCursorEffect,
  safeIndexSegmentPathEffect,
  timestampMsEffect,
} from "./index-state-effect.js";
function run<A>(effect: Effect.Effect<A, IndexStateError>): A {
  return Effect.runSync(
    effect.pipe(
      Effect.mapError((error) =>
        error.cause instanceof Error ? error.cause : new Error(error.message),
      ),
    ),
  );
}
/**
 * Creates empty mutable index state.
 * @returns Fresh state with field maps and no records.
 * @example
 * const state = createIndexState();
 */
export function createIndexState(): IndexState {
  return run(createIndexStateEffect());
}
/**
 * Validates and normalizes index settings.
 * @param options - Retention, page, redaction, and clock options.
 * @returns Normalized index configuration.
 * @throws {TypeError} If a bound is invalid.
 * @example
 * const config = normalizeOptions({ maxEntries: 100 });
 */
export function normalizeOptions(options: ObservabilityIndexOptions): IndexConfig {
  return run(normalizeIndexOptionsEffect(options));
}
/**
 * Builds an immutable entry from one model record and byte location.
 * @param record - Observability record.
 * @param segment - Relative segment path.
 * @param offset - Byte offset.
 * @param bytes - Byte length.
 * @param sequence - Monotonic cursor sequence.
 * @returns The index entry.
 * @throws {TypeError} If the timestamp is missing.
 * @example
 * const entry = makeEntry(record, path, 0, 10, 1);
 */
export function makeEntry(
  record: ObservabilityRecord,
  segment: string,
  offset: number,
  bytes: number,
  sequence: number,
): ObservabilityIndexEntry {
  return run(makeIndexEntryEffect(record, segment, offset, bytes, sequence));
}
/**
 * Validates a record's version, timestamp, and byte location.
 * @param record - Candidate record.
 * @param offset - Byte offset.
 * @param bytes - Byte length.
 * @returns Nothing after successful validation.
 * @throws {TypeError} If any field is invalid.
 * @example
 * assertEntry(record, 0, 10);
 */
export function assertEntry(record: ObservabilityRecord, offset: number, bytes: number): void {
  return run(assertIndexEntryEffect(record, offset, bytes));
}
/**
 * Chooses the first valid timestamp on a record.
 * @param record - Observability record.
 * @returns Timestamp text.
 * @throws {TypeError} If no timestamp is valid.
 * @example
 * const time = timestampFor(record);
 */
export function timestampFor(record: ObservabilityRecord): string {
  return run(indexTimestampEffect(record));
}
/**
 * Parses a timestamp to milliseconds when valid.
 * @param value - Timestamp text.
 * @returns Milliseconds or undefined.
 * @example
 * const time = timestampMs(text);
 */
export function timestampMs(value: string): number | undefined {
  return run(timestampMsEffect(value));
}
/**
 * Copies one nonempty text field.
 * @param value - Source object.
 * @param key - Field name.
 * @returns The field or an empty object.
 * @example
 * const field = optionalText(record, "traceId");
 */
export function optionalText(value: Record<string, unknown>, key: string): Record<string, string> {
  return run(optionalIndexTextEffect(value, key));
}
/**
 * Validates and caps a page limit.
 * @param value - Requested limit.
 * @param fallback - Default limit.
 * @param maximum - Maximum allowed limit.
 * @returns A positive bounded limit.
 * @throws {TypeError} If the supplied limit is invalid.
 * @example
 * const limit = boundedLimit(10, 20, 100);
 */
export function boundedLimit(value: number | undefined, fallback: number, maximum: number): number {
  return run(boundedIndexLimitEffect(value, fallback, maximum));
}
/**
 * Parses a nonnegative integer cursor.
 * @param value - Cursor text.
 * @returns The cursor as a number.
 * @throws {TypeError} If the cursor is invalid.
 * @example
 * const cursor = parseCursor("1");
 */
export function parseCursor(value: string): number {
  return run(parseIndexCursorEffect(value));
}
/**
 * Resolves a segment path beneath the storage root.
 * @param root - Storage root.
 * @param segment - Relative segment path.
 * @returns The absolute segment path.
 * @throws {TypeError} If the path escapes the root.
 * @example
 * const path = safeSegmentPath(root, "logs/day/file");
 */
export function safeSegmentPath(root: string, segment: string): string {
  return run(safeIndexSegmentPathEffect(root, segment));
}
/**
 * Matches one entry against query filters.
 * @param entry - Index entry.
 * @param options - Query filters.
 * @returns True when all supplied filters match.
 * @example
 * if (matches(entry, { signal: "log" })) consume(entry);
 */
export function matches(
  entry: ObservabilityIndexEntry,
  options: ObservabilityIndexPageOptions,
): boolean {
  return run(matchesIndexEntryEffect(entry, options));
}
