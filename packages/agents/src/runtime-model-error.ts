import { Schema } from "effect";

/** Tagged model resolution or content limit failure. */
export class AgentModelResolutionFailure extends Schema.TaggedError<AgentModelResolutionFailure>()(
  "AgentModelResolutionFailure",
  { message: Schema.String, cause: Schema.Unknown },
) {}

/** Preserves a model provider or limit error for Effect callers.
 * @param cause - Provider or validation failure.
 * @returns A tagged model resolution failure.
 * @example agentModelResolutionFailure(new Error("unavailable"));
 */
export function agentModelResolutionFailure(cause: unknown): AgentModelResolutionFailure {
  return new AgentModelResolutionFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
