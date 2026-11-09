import { Schema } from "effect";

/** Tagged validation failure while copying an agent definition. */
export class AgentDefinitionFailure extends Schema.TaggedError<AgentDefinitionFailure>()(
  "AgentDefinitionFailure",
  { message: Schema.String, cause: Schema.Unknown },
) {}

/** Preserves the original authoring error in a tagged Effect failure.
 * @param cause - Invalid authoring input or validation error.
 * @returns An AgentDefinitionFailure with the original cause.
 * @example agentDefinitionFailure(new TypeError("invalid"));
 */
export function agentDefinitionFailure(cause: unknown): AgentDefinitionFailure {
  return new AgentDefinitionFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
