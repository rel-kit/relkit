import type { FileHandle } from "node:fs/promises";
import { Clock, Duration, Effect, Exit, Metric, Schema } from "effect";
import type { RedactionPolicy } from "../redaction.js";
import { segmentFilesCore } from "./segment-files-core.js";
/**
 * Tagged segment filesystem failure with its original cause.
 * @example
 * if (error._tag === "SegmentFileError") console.error(error.operation);
 */
export class SegmentFileError extends Schema.TaggedError<SegmentFileError>()("SegmentFileError", {
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
          Metric.counter("relkit_observability_segment_files_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_segment_file_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
function io<A>(operation: string, run: () => Promise<A>) {
  return observe(
    operation,
    Effect.uninterruptible(
      Effect.tryPromise({
        try: run,
        catch: (cause) =>
          new SegmentFileError({
            operation,
            message: cause instanceof Error ? cause.message : String(cause),
            cause,
          }),
      }),
    ),
  );
}
/**
 * Checks or creates one private directory in an observed Effect.
 * @param path - Directory path.
 * @returns An Effect with completion or tagged filesystem failure.
 * @example
 * await Effect.runPromise(ensureDirectoryEffect(root));
 */
export const ensureDirectoryEffect = Effect.fn("ObservabilitySegmentFiles.ensureDirectory")(
  (path: string) => io("ensureDirectory", () => segmentFilesCore.ensureDirectory(path)),
);
/**
 * Resolves and creates the storage root in an observed Effect.
 * @param requestedRoot - Optional root path.
 * @returns An Effect with the absolute root or tagged validation/IO failure.
 * @example
 * const root = await Effect.runPromise(ensureSegmentRootEffect(path));
 */
export const ensureSegmentRootEffect = Effect.fn("ObservabilitySegmentFiles.ensureRoot")(
  (requestedRoot?: string) =>
    io("ensureRoot", () => segmentFilesCore.ensureSegmentRoot(requestedRoot)),
);
/**
 * Repairs malformed segment tails in an observed Effect.
 * @param root - Storage root.
 * @param policy - Optional redaction policy.
 * @returns An Effect with completion or tagged repair failure.
 * @example
 * await Effect.runPromise(repairSegmentsEffect(root));
 */
export const repairSegmentsEffect = Effect.fn("ObservabilitySegmentFiles.repair")(
  (root: string, policy?: RedactionPolicy) =>
    io("repair", () => segmentFilesCore.repairSegments(root, policy)),
);
/**
 * Lists segment metadata in an observed Effect.
 * @param directory - One day directory.
 * @returns An Effect with sorted files or tagged IO failure.
 * @example
 * const files = await Effect.runPromise(listSegmentsEffect(dayRoot));
 */
export const listSegmentsEffect = Effect.fn("ObservabilitySegmentFiles.list")((directory: string) =>
  io("list", () => segmentFilesCore.listSegments(directory)),
);
/**
 * Appends one NDJSON line to an owned handle in an observed Effect.
 * @param handle - Open segment handle.
 * @param line - Complete NDJSON line.
 * @returns An Effect with completion or tagged write failure.
 * @example
 * await Effect.runPromise(appendLineEffect(handle, line));
 */
export const appendLineEffect = Effect.fn("ObservabilitySegmentFiles.appendLine")(
  (handle: FileHandle, line: string) =>
    io("appendLine", () => segmentFilesCore.appendLine(handle, line)),
);
/**
 * Atomically replaces one file in an observed Effect.
 * @param path - Destination path.
 * @param value - Complete contents.
 * @returns An Effect with durable replacement or tagged IO failure.
 * @example
 * await Effect.runPromise(writeAtomicEffect(path, text));
 */
export const writeAtomicEffect = Effect.fn("ObservabilitySegmentFiles.writeAtomic")(
  (path: string, value: string) =>
    io("writeAtomic", () => segmentFilesCore.writeAtomic(path, value)),
);
/**
 * Syncs and closes a directory handle in an observed Effect.
 * @param path - Directory path.
 * @returns An Effect with completion or tagged IO failure.
 * @example
 * await Effect.runPromise(syncDirectoryEffect(root));
 */
export const syncDirectoryEffect = Effect.fn("ObservabilitySegmentFiles.syncDirectory")(
  (path: string) => io("syncDirectory", () => segmentFilesCore.syncDirectory(path)),
);
/**
 * Chooses the storage directory for a signal in an observed Effect.
 * @param signal - Candidate model signal.
 * @returns An Effect with a known directory or undefined.
 * @example
 * const directory = Effect.runSync(segmentDirectoryForEffect("log"));
 */
export const segmentDirectoryForEffect = Effect.fn("ObservabilitySegmentFiles.directoryFor")(
  (signal: unknown) =>
    observe(
      "directoryFor",
      Effect.sync(() => segmentFilesCore.segmentDirectoryFor(signal)),
    ),
);
