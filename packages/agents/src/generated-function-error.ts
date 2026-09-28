import { Schema } from "effect";

/** Tagged invalid generated function identity or executor. */
export class GeneratedAgentFunctionFailure extends Schema.TaggedError<GeneratedAgentFunctionFailure>()(
  "GeneratedAgentFunctionFailure",
  { message: Schema.String, cause: Schema.Unknown },
) {}

/** Preserves an invalid generated function error for Effect callers.
 * @param cause - Identity or executor validation error.
 * @returns A tagged generated function failure.
 * @example generatedAgentFunctionFailure(new TypeError("invalid"));
 */
export function generatedAgentFunctionFailure(cause: unknown): GeneratedAgentFunctionFailure {
  return new GeneratedAgentFunctionFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
