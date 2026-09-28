import { Schema } from "effect";

/** Tagged graph node validation failure. */
export class GraphNodeValidationFailure extends Schema.TaggedError<GraphNodeValidationFailure>()(
  "GraphNodeValidationFailure",
  { message: Schema.String, cause: Schema.Unknown },
) {}

/** Preserves a graph node validation error for Effect callers.
 * @param cause - Schema, destination, or update failure.
 * @returns A tagged graph node failure.
 * @example graphNodeValidationFailure(new TypeError("invalid"));
 */
export function graphNodeValidationFailure(cause: unknown): GraphNodeValidationFailure {
  return new GraphNodeValidationFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
