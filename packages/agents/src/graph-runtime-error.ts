import { Schema } from "effect";

/** Tagged graph invocation failure with the original runtime cause. */
export class GraphInvocationFailure extends Schema.TaggedError<GraphInvocationFailure>()(
  "GraphInvocationFailure",
  { message: Schema.String, cause: Schema.Unknown },
) {}

/** Preserves a graph invocation failure for Effect callers.
 * @param cause - Graph, schema, provider, or cancellation error.
 * @returns A tagged graph invocation failure.
 * @example graphInvocationFailure(new Error("graph failed"));
 */
export function graphInvocationFailure(cause: unknown): GraphInvocationFailure {
  return new GraphInvocationFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
