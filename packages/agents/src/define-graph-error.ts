import { Schema } from "effect";

/** Tagged invalid graph authoring options or descriptor construction. */
export class GraphDefinitionFailure extends Schema.TaggedError<GraphDefinitionFailure>()(
  "GraphDefinitionFailure",
  { message: Schema.String, cause: Schema.Unknown },
) {}

/** Preserves a graph authoring error for Effect callers.
 * @param cause - Invalid graph schema, node, edge, or identity.
 * @returns A tagged graph definition failure.
 * @example graphDefinitionFailure(new TypeError("invalid graph"));
 */
export function graphDefinitionFailure(cause: unknown): GraphDefinitionFailure {
  return new GraphDefinitionFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
