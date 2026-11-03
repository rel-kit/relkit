import { Clock, Duration, Effect, Exit, Metric, Schema } from "effect";
import type { ObservabilityRecord } from "../model.js";
import * as indexStateCore from "./index-state-core.js";
import type {
  ObservabilityIndexEntry,
  ObservabilityIndexOptions,
  ObservabilityIndexPageOptions,
} from "./index.types.js";
/**
 * Tagged index state validation failure with the original cause.
 * @example
 * if (error._tag === "IndexStateError") console.error(error.operation);
 */
export class IndexStateError extends Schema.TaggedError<IndexStateError>()("IndexStateError", {
  operation: Schema.String,
  message: Schema.String,
  cause: Schema.Unknown,
}) {}
function observed<A>(operation: string, run: () => A) {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(
      Effect.try({
        try: run,
        catch: (cause) =>
          new IndexStateError({
            operation,
            message: cause instanceof Error ? cause.message : String(cause),
            cause,
          }),
      }),
      (exit) =>
        Effect.gen(function* () {
          yield* Metric.update(
            Metric.counter("relkit_observability_index_state_total", {
              attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
            }),
            1,
          );
          yield* Metric.update(
            Metric.timer("relkit_observability_index_state_duration", {
              attributes: { operation },
            }),
            Duration.millis((yield* Clock.currentTimeMillis) - started),
          );
        }),
    );
  });
}
/**
 * Creates empty mutable index state.
 * @returns An Effect with new state or a tagged defect.
 * @example
 * const state = Effect.runSync(createIndexStateEffect());
 */
export const createIndexStateEffect = Effect.fn("ObservabilityIndexState.create")(() =>
  observed("create", indexStateCore.createIndexState),
);
/**
 * Validates and normalizes index options.
 * @param options - Retention, page, redaction, and clock options.
 * @returns An Effect with normalized config or a tagged bound error.
 * @example
 * const config = Effect.runSync(normalizeIndexOptionsEffect({}));
 */
export const normalizeIndexOptionsEffect = Effect.fn("ObservabilityIndexState.normalize")(
  (options: ObservabilityIndexOptions) =>
    observed("normalize", () => indexStateCore.normalizeOptions(options)),
);
/**
 * Builds one immutable index entry from a record and byte location.
 * @param record - Observability record.
 * @param segment - Relative segment path.
 * @param offset - Byte offset.
 * @param bytes - Byte length.
 * @param sequence - Monotonic cursor sequence.
 * @returns An Effect with the entry or a tagged timestamp error.
 * @example
 * const entry = Effect.runSync(makeIndexEntryEffect(record, path, 0, 10, 1));
 */
export const makeIndexEntryEffect = Effect.fn("ObservabilityIndexState.makeEntry")(
  (record: ObservabilityRecord, segment: string, offset: number, bytes: number, sequence: number) =>
    observed("makeEntry", () => indexStateCore.makeEntry(record, segment, offset, bytes, sequence)),
);
/**
 * Validates a record's version, timestamp, and byte location.
 * @param record - Candidate record.
 * @param offset - Byte offset.
 * @param bytes - Byte length.
 * @returns An Effect with completion or a tagged validation error.
 * @example
 * Effect.runSync(assertIndexEntryEffect(record, 0, 10));
 */
export const assertIndexEntryEffect = Effect.fn("ObservabilityIndexState.assertEntry")(
  (record: ObservabilityRecord, offset: number, bytes: number) =>
    observed("assertEntry", () => indexStateCore.assertEntry(record, offset, bytes)),
);
/**
 * Chooses the first valid model timestamp.
 * @param record - Observability record.
 * @returns An Effect with the timestamp or a tagged missing-time error.
 * @example
 * const time = Effect.runSync(indexTimestampEffect(record));
 */
export const indexTimestampEffect = Effect.fn("ObservabilityIndexState.timestamp")(
  (record: ObservabilityRecord) => observed("timestamp", () => indexStateCore.timestampFor(record)),
);
/**
 * Parses a timestamp to milliseconds when valid.
 * @param value - Timestamp text.
 * @returns An Effect with milliseconds or undefined.
 * @example
 * const time = Effect.runSync(timestampMsEffect(text));
 */
export const timestampMsEffect = Effect.fn("ObservabilityIndexState.timestampMs")((value: string) =>
  observed("timestampMs", () => indexStateCore.timestampMs(value)),
);
/**
 * Copies one nonempty text field from a record.
 * @param value - Source object.
 * @param key - Field key.
 * @returns An Effect with the field or an empty object.
 * @example
 * const field = Effect.runSync(optionalIndexTextEffect(record, "traceId"));
 */
export const optionalIndexTextEffect = Effect.fn("ObservabilityIndexState.optionalText")(
  (value: Record<string, unknown>, key: string) =>
    observed("optionalText", () => indexStateCore.optionalText(value, key)),
);
/**
 * Validates and caps a page limit.
 * @param value - Requested limit.
 * @param fallback - Default limit.
 * @param maximum - Maximum allowed limit.
 * @returns An Effect with a positive bound or a tagged error.
 * @example
 * const limit = Effect.runSync(boundedIndexLimitEffect(10, 20, 100));
 */
export const boundedIndexLimitEffect = Effect.fn("ObservabilityIndexState.boundedLimit")(
  (value: number | undefined, fallback: number, maximum: number) =>
    observed("boundedLimit", () => indexStateCore.boundedLimit(value, fallback, maximum)),
);
/**
 * Parses a nonnegative integer cursor.
 * @param value - Cursor text.
 * @returns An Effect with the cursor or a tagged validation error.
 * @example
 * const cursor = Effect.runSync(parseIndexCursorEffect("1"));
 */
export const parseIndexCursorEffect = Effect.fn("ObservabilityIndexState.parseCursor")(
  (value: string) => observed("parseCursor", () => indexStateCore.parseCursor(value)),
);
/**
 * Resolves a segment path beneath the storage root.
 * @param root - Storage root.
 * @param segment - Relative segment path.
 * @returns An Effect with the absolute path or a tagged traversal error.
 * @example
 * const path = Effect.runSync(safeIndexSegmentPathEffect(root, "logs/day/file"));
 */
export const safeIndexSegmentPathEffect = Effect.fn("ObservabilityIndexState.safePath")(
  (root: string, segment: string) =>
    observed("safePath", () => indexStateCore.safeSegmentPath(root, segment)),
);
/**
 * Matches an index entry against supplied filters.
 * @param entry - Index entry.
 * @param options - Query filters.
 * @returns An Effect with the match result.
 * @example
 * const included = Effect.runSync(matchesIndexEntryEffect(entry, {}));
 */
export const matchesIndexEntryEffect = Effect.fn("ObservabilityIndexState.matches")(
  (entry: ObservabilityIndexEntry, options: ObservabilityIndexPageOptions) =>
    observed("matches", () => indexStateCore.matches(entry, options)),
);
