import { Schema } from "effect";

/** Tagged graph workflow projection failure. */
export class GraphWorkflowFailure extends Schema.TaggedError<GraphWorkflowFailure>()(
  "GraphWorkflowFailure",
  { message: Schema.String, cause: Schema.Unknown },
) {}

/** Preserves a graph workflow projection error.
 * @param cause - Node, edge, or schema projection failure.
 * @returns A tagged workflow failure.
 * @example graphWorkflowFailure(new TypeError("invalid node"));
 */
export function graphWorkflowFailure(cause: unknown): GraphWorkflowFailure {
  return new GraphWorkflowFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
