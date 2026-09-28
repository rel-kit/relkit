import { Schema } from "effect";

/** Typed bucket validation or IO failure for DeepAgents operations. */
export class DeepAgentBucketFailure extends Schema.TaggedError<DeepAgentBucketFailure>()(
  "DeepAgentBucketFailure",
  { message: Schema.String, cause: Schema.Unknown },
) {}

/** Captures a bucket error while preserving its original cause.
 * @param cause - Bucket provider or virtual-path failure.
 * @returns A tagged bucket failure.
 * @example deepAgentBucketFailure(new Error("not found"));
 */
export function deepAgentBucketFailure(cause: unknown): DeepAgentBucketFailure {
  return new DeepAgentBucketFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
