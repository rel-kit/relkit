import { Schema } from "effect";

/** A typed persistence acquire, validation, or release failure. */
export class AgentPersistenceFailure extends Schema.TaggedError<AgentPersistenceFailure>()(
  "AgentPersistenceFailure",
  { message: Schema.String, cause: Schema.Unknown },
) {}

/** Retains the original failure for compatibility callers.
 * @param cause - Persistence provider or protocol error.
 * @returns A tagged persistence failure.
 * @example agentPersistenceFailure(new Error("store unavailable"));
 */
export function agentPersistenceFailure(cause: unknown): AgentPersistenceFailure {
  return new AgentPersistenceFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
