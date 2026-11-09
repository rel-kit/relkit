import { Effect, Schema } from "effect";
import { runJobsSync } from "./compatibility.js";
import type { RoutingManifest } from "./worker-entries-support.types.js";

export type { RoutingEntry, RoutingManifest } from "./worker-entries-support.types.js";

/** Portable routing identity; historical fields remain available for conflict comparison. */
export const RoutingEntrySchema = Schema.Struct({
  jobId: Schema.String,
  taskId: Schema.String,
  buildId: Schema.String,
  serviceGeneration: Schema.String,
});

/** Retains old entry metadata because immutable comparisons include every persisted key. */
const PersistedRoutingEntry = Schema.StructWithRest(RoutingEntrySchema, [
  Schema.Record(Schema.String, Schema.Unknown),
]);

/** Persisted version-one routing contract. */
export const RoutingManifestSchema = Schema.Struct({
  protocol: Schema.Literal("relkit.jobs-routing"),
  version: Schema.Literal(1),
  buildId: Schema.String,
  serviceGeneration: Schema.String,
  entries: Schema.Array(PersistedRoutingEntry),
});

/** Path validation failure retaining the original TypeError for legacy edges. */
export class JobWorkerPathError extends Schema.TaggedError<JobWorkerPathError>()(
  "JobWorkerPathError",
  { segment: Schema.String, cause: Schema.Defect() },
) {}

/**
 * Validates an immutable identity before it participates in a filesystem path.
 * @param value - Candidate build or service generation segment.
 * @param name - Segment label included in the original error message.
 * @returns A lazy effect yielding void or failing with JobWorkerPathError.
 */
export const assertSegmentEffect = Effect.fn("Jobs.assertSegment")(function* (
  value: string,
  name: string,
) {
  if (
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    return yield* new JobWorkerPathError({
      segment: name,
      cause: new TypeError(`Job worker ${name} must be one safe path segment.`),
    });
  }
});

/**
 * Validates a path segment at a synchronous compatibility edge.
 * @param value - Candidate immutable identity segment.
 * @param name - Segment label used in diagnostics.
 * @returns Nothing when the segment is safe.
 * @throws TypeError when the segment is empty, traversal, or contains separators.
 */
export function assertSegment(value: string, name: string): void {
  return runJobsSync(
    assertSegmentEffect(value, name).pipe(Effect.mapError((error) => error.cause)),
  );
}

/**
 * Recognizes the recoverable missing-file condition at a Node filesystem edge.
 * @param error - Original filesystem rejection.
 * @returns Whether the rejection carries ENOENT.
 */
export function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Checks persisted routing data without stripping historical fields.
 * @param value - Unknown parsed JSON value.
 * @returns Whether the value satisfies the routing schema.
 */
export const isRoutingManifest: (value: unknown) => value is RoutingManifest =
  Schema.is(RoutingManifestSchema);
