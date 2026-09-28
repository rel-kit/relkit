import { Schema } from "effect";

/** Tagged validation or state failure while resuming a graph. */
export class GraphContinuationFailure extends Schema.TaggedError<GraphContinuationFailure>()(
  "GraphContinuationFailure",
  { message: Schema.String, cause: Schema.Unknown },
) {}

/** Preserves the original graph continuation error.
 * @param cause - Invalid continuation or graph provider failure.
 * @returns A tagged continuation failure.
 * @example graphContinuationFailure(new TypeError("invalid reply"));
 */
export function graphContinuationFailure(cause: unknown): GraphContinuationFailure {
  return new GraphContinuationFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
