import { Schema } from "effect";

/** Tagged graph compilation or route execution failure. */
export class GraphCompilationFailure extends Schema.TaggedError<GraphCompilationFailure>()(
  "GraphCompilationFailure",
  { message: Schema.String, cause: Schema.Unknown },
) {}

/** Preserves a graph compilation or route error for Effect callers.
 * @param cause - LangGraph, route, or validation failure.
 * @returns A tagged graph compilation failure.
 * @example graphCompilationFailure(new TypeError("invalid route"));
 */
export function graphCompilationFailure(cause: unknown): GraphCompilationFailure {
  return new GraphCompilationFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
