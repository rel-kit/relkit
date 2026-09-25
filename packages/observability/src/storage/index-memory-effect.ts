import { Clock, Duration, Effect, Exit, Metric, Schema } from "effect";
import type { RedactedObservabilityRecord } from "../record-admission.types.js";
import * as indexMemoryCore from "./index-memory-core.js";
import type { SegmentLine, SegmentScan } from "./index-files.types.js";
import type { IndexConfig, IndexState } from "./index-state.types.js";
import type { ObservabilityIndexPageOptions } from "./index.types.js";
/**
 * Tagged index memory failure with its original validation cause.
 * @example
 * if (error._tag === "IndexMemoryError") console.error(error.operation);
 */
export class IndexMemoryError extends Schema.TaggedError<IndexMemoryError>()("IndexMemoryError", {
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
          new IndexMemoryError({
            operation,
            message: cause instanceof Error ? cause.message : String(cause),
            cause,
          }),
      }),
      (exit) =>
        Effect.gen(function* () {
          yield* Metric.update(
            Metric.counter("relkit_observability_index_memory_total", {
              attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
            }),
            1,
          );
          yield* Metric.update(
            Metric.timer("relkit_observability_index_memory_duration", {
              attributes: { operation },
            }),
            Duration.millis((yield* Clock.currentTimeMillis) - started),
          );
        }),
    );
  });
}
/**
 * Adds or updates one segment's in-memory metadata.
 * @param state - Mutable index state.
 * @param value - Segment metadata.
 * @returns An Effect with the mutable segment or tagged failure.
 * @example
 * const segment = Effect.runSync(addIndexSegmentEffect(state, scan));
 */
export const addIndexSegmentEffect = Effect.fn("ObservabilityIndexMemory.addSegment")(
  (state: IndexState, value: SegmentScan) =>
    observed("addSegment", () => indexMemoryCore.addSegment(state, value)),
);
/**
 * Adds a scanned line to in-memory index state.
 * @param state - Mutable index state.
 * @param root - Segment root.
 * @param line - Scanned record and byte location.
 * @returns An Effect with completion or tagged validation failure.
 * @example
 * Effect.runSync(addIndexLineEffect(state, root, line));
 */
export const addIndexLineEffect = Effect.fn("ObservabilityIndexMemory.addLine")(
  (state: IndexState, root: string, line: SegmentLine) =>
    observed("addLine", () => indexMemoryCore.addLine(state, root, line)),
);
/**
 * Adds or replaces one record entry at a segment location.
 * @param state - Mutable index state.
 * @param root - Segment root.
 * @param record - Admitted record.
 * @param path - Absolute segment path.
 * @param offset - Byte offset.
 * @param bytes - Byte length.
 * @param countBytes - Whether to add bytes to segment totals.
 * @returns An Effect with the entry or tagged validation failure.
 * @example
 * const entry = Effect.runSync(addIndexRecordEffect(state, root, record, path, 0, 10));
 */
export const addIndexRecordEffect = Effect.fn("ObservabilityIndexMemory.addRecord")(
  (
    state: IndexState,
    root: string,
    record: RedactedObservabilityRecord,
    path: string,
    offset: number,
    bytes: number,
    countBytes = true,
  ) =>
    observed("addRecord", () =>
      indexMemoryCore.addRecord(state, root, record, path, offset, bytes, countBytes),
    ),
);
/**
 * Updates in-memory paths after an active segment is finalized.
 * @param state - Mutable index state.
 * @param root - Segment root.
 * @param activePath - Former active path.
 * @param finalPath - Finalized path.
 * @returns An Effect with completion or tagged failure.
 * @example
 * Effect.runSync(renameIndexSegmentEffect(state, root, active, final));
 */
export const renameIndexSegmentEffect = Effect.fn("ObservabilityIndexMemory.renameSegment")(
  (state: IndexState, root: string, activePath: string, finalPath: string) =>
    observed("renameSegment", () =>
      indexMemoryCore.renameSegment(state, root, activePath, finalPath),
    ),
);
/**
 * Reads one filtered page from current in-memory entries.
 * @param state - Current index state.
 * @param config - Page settings.
 * @param options - Cursor and filters.
 * @returns An Effect with the page or tagged bound failure.
 * @example
 * const page = Effect.runSync(readIndexPageEffect(state, config, {}));
 */
export const readIndexPageEffect = Effect.fn("ObservabilityIndexMemory.readPage")(
  (state: IndexState, config: IndexConfig, options: ObservabilityIndexPageOptions) =>
    observed("readPage", () => indexMemoryCore.readPage(state, config, options)),
);
/**
 * Removes one entry and its field indexes by cursor.
 * @param state - Mutable index state.
 * @param root - Segment root.
 * @param cursor - Entry cursor.
 * @returns An Effect with completion or tagged path failure.
 * @example
 * Effect.runSync(removeIndexEntryEffect(state, root, "1"));
 */
export const removeIndexEntryEffect = Effect.fn("ObservabilityIndexMemory.removeEntry")(
  (state: IndexState, root: string, cursor: string) =>
    observed("removeEntry", () => indexMemoryCore.removeEntry(state, root, cursor)),
);
/**
 * Drops the oldest entries until the configured bound is met.
 * @param state - Mutable index state.
 * @param root - Segment root.
 * @param maxEntries - Maximum retained entries.
 * @returns An Effect with completion or tagged path failure.
 * @example
 * Effect.runSync(trimIndexEntriesEffect(state, root, 100));
 */
export const trimIndexEntriesEffect = Effect.fn("ObservabilityIndexMemory.trimEntries")(
  (state: IndexState, root: string, maxEntries: number) =>
    observed("trimEntries", () => indexMemoryCore.trimEntries(state, root, maxEntries)),
);
/**
 * Summarizes in-memory record and segment counts.
 * @param state - Current index state.
 * @returns An Effect with the counts.
 * @example
 * const stats = Effect.runSync(indexMemoryStatsEffect(state));
 */
export const indexMemoryStatsEffect = Effect.fn("ObservabilityIndexMemory.stats")(
  (state: IndexState) => observed("stats", () => indexMemoryCore.stats(state)),
);
