import { deepFreeze } from "@relkit/contracts";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { agentDefinitionFailure } from "./define-agent-error.js";
import type {
  AgentInstructions,
  PromptInstructions,
  PromptTemplate,
} from "./define-agent.types.js";

/** Validates and freezes agent instructions.
 * @param value - Text, prompt descriptor, or template input.
 * @returns An Effect with copied instructions or AgentDefinitionFailure.
 * @example Effect.runSync(copyAgentInstructionsEffect("Answer clearly"));
 */
export const copyAgentInstructionsEffect = Effect.fn("Agents.definition.copyInstructions")(
  (value: unknown) =>
    Effect.try({
      try: () => copyAgentInstructionsValue(value),
      catch: agentDefinitionFailure,
    }),
  (effect) => observeAgent("definition.copy-instructions", effect),
);

/** Copies instructions for existing synchronous authoring callers.
 * @param value - Text, prompt descriptor, or template input.
 * @returns Validated immutable instructions.
 * @throws The original invalid instruction error.
 * @example const instructions = copyAgentInstructions("Answer clearly");
 */
export function copyAgentInstructions(value: unknown): AgentInstructions {
  return Effect.runSync(
    copyAgentInstructionsEffect(value).pipe(
      Effect.catchTag("AgentDefinitionFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

function copyAgentInstructionsValue(value: unknown): AgentInstructions {
  if (typeof value === "string") return requiredText(value, "Agent instructions");
  if (!isRecord(value)) throw new TypeError("Agent instructions must be text or a template");
  if (value.kind === "prompt") return copyPrompt(value);
  const template = requiredText(value.template, "Agent instructions template");
  const variables = copyVariables(value.variables);
  return deepFreeze({ template, ...(variables === undefined ? {} : { variables }) });
}

/** Checks whether a value is an agent instruction descriptor.
 * @param value - Candidate authoring value.
 * @returns An Effect with a boolean and no typed failure.
 * @example Effect.runSync(isAgentInstructionsEffect("Answer clearly"));
 */
export const isAgentInstructionsEffect = Effect.fn("Agents.definition.isInstructions")(
  (value: unknown) => Effect.sync(() => isAgentInstructionsValue(value)),
  (effect) => observeAgent("definition.is-instructions", effect),
);

/** Checks instructions for existing synchronous authoring callers.
 * @param value - Candidate authoring value.
 * @returns Whether the value is valid instructions.
 * @example if (isAgentInstructions(value)) use(value);
 */
export function isAgentInstructions(value: unknown): value is AgentInstructions {
  return Effect.runSync(isAgentInstructionsEffect(value));
}

function isAgentInstructionsValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (isRecord(value) && value.kind === "prompt") {
    const prompt = value.value;
    return (
      (typeof prompt === "string" && prompt.trim() !== "") ||
      (Array.isArray(prompt) &&
        prompt.length > 0 &&
        prompt.every((entry) => typeof entry === "string" && entry.trim() !== ""))
    );
  }
  if (!isRecord(value) || typeof value.template !== "string" || value.template.trim() === "")
    return false;
  return (
    value.variables === undefined ||
    (Array.isArray(value.variables) &&
      value.variables.every((entry) => typeof entry === "string" && entry.trim() !== ""))
  );
}

function copyPrompt(value: Record<PropertyKey, unknown>): PromptInstructions {
  if (
    typeof value.id !== "string" ||
    !isRecord(value.ref) ||
    value.ref.kind !== "prompt" ||
    value.ref.id !== value.id
  ) {
    throw new TypeError("Agent prompt instructions must be a prompt descriptor");
  }
  const prompt = value.value;
  const entries = typeof prompt === "string" ? [prompt] : prompt;
  if (
    !Array.isArray(entries) ||
    entries.length === 0 ||
    entries.some((entry) => typeof entry !== "string" || entry.trim() === "")
  ) {
    throw new TypeError("Agent prompt instructions must contain nonempty text");
  }
  return value as unknown as PromptInstructions;
}

function copyVariables(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError("template.variables must be an array");
  const variables = value.map((entry) => requiredText(entry, "template variable"));
  if (new Set(variables).size !== variables.length) {
    throw new TypeError("template.variables must be unique");
  }
  return Object.freeze(variables);
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
