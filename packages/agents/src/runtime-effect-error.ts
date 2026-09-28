import { Schema } from "effect";
import { AgentRuntimeError } from "./runtime-errors.js";

/** A typed Effect failure that retains the public invocation error as its cause. */
export class AgentInvocationFailure extends Schema.TaggedError<AgentInvocationFailure>()(
  "AgentInvocationFailure",
  { code: Schema.String, message: Schema.String, cause: Schema.Unknown },
) {}

/** Captures an invocation failure without losing compatibility error details.
 * @param cause - Rejected dependency, validation, or runtime error.
 * @returns A tagged failure carrying its original cause.
 * @example agentInvocationFailure(new Error("model unavailable"));
 */
export function agentInvocationFailure(cause: unknown): AgentInvocationFailure {
  return new AgentInvocationFailure({
    code: cause instanceof AgentRuntimeError ? cause.code : "RELKIT_AGENT_INVOCATION_FAILED",
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
