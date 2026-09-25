import { Clock, Duration, Effect, Exit, Metric, Schema } from "effect";
import type { RedactionPolicy } from "../redaction.js";
import { indexFilesCore } from "./index-files-core.js";
import type { SegmentScanVisitor } from "./index-files.types.js";
/**
 * Tagged index scan failure with its original cause.
 * @example
 * if (error._tag === "IndexFileError") console.error(error.operation);
 */
export class IndexFileError extends Schema.TaggedError<IndexFileError>()("IndexFileError", {
  operation: Schema.String,
  message: Schema.String,
  cause: Schema.Unknown,
}) {}
function observe<A, E>(operation: string, effect: Effect.Effect<A, E>): Effect.Effect<A, E> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_index_files_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_index_file_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
/**
 * Scans valid segment records in stable filesystem order.
 * @param root - Segment storage root.
 * @param policy - Redaction policy applied before visiting records.
 * @param visitor - Callbacks for each segment and admitted line.
 * @returns An Effect with completion or a tagged scan failure.
 * @example
 * await Effect.runPromise(scanObservabilitySegmentsEffect(root, policy, visitor));
 */
export const scanObservabilitySegmentsEffect = Effect.fn("ObservabilityIndexFiles.scan")(
  (root: string, policy: RedactionPolicy | undefined, visitor: SegmentScanVisitor) =>
    observe(
      "scan",
      Effect.tryPromise({
        try: (signal) => indexFilesCore.scanObservabilitySegments(root, policy, visitor, signal),
        catch: (cause) =>
          new IndexFileError({
            operation: "scan",
            message: cause instanceof Error ? cause.message : String(cause),
            cause,
          }),
      }),
    ),
);
/**
 * Converts an absolute segment path to a portable relative path.
 * @param root - Segment root.
 * @param path - Absolute segment path.
 * @returns An Effect with the slash-separated path.
 * @example
 * const name = Effect.runSync(relativeSegmentPathEffect(root, path));
 */
export const relativeSegmentPathEffect = Effect.fn("ObservabilityIndexFiles.relativePath")(
  (root: string, path: string) =>
    observe(
      "relativePath",
      Effect.sync(() => indexFilesCore.relativeSegmentPath(root, path)),
    ),
);
/**
 * Gets the basename of a segment path.
 * @param path - Segment path.
 * @returns An Effect with the basename.
 * @example
 * const name = Effect.runSync(segmentNameEffect(path));
 */
export const segmentNameEffect = Effect.fn("ObservabilityIndexFiles.segmentName")((path: string) =>
  observe(
    "segmentName",
    Effect.sync(() => indexFilesCore.segmentName(path)),
  ),
);
