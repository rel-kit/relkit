import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { AgentModel } from "./define-agent-native.types.js";

/** Checks whether a value can select or provide a native agent model.
 * @param value - Candidate selector, model, or factory.
 * @returns An Effect with a boolean and no typed failure.
 * @example Effect.runSync(isAgentModelEffect("openai:gpt"));
 */
export const isAgentModelEffect = Effect.fn("Agents.definition.isModel")(
  (value: unknown) =>
    Effect.sync(
      () =>
        typeof value === "string" ||
        typeof value === "function" ||
        (isRecord(value) && typeof value.invoke === "function"),
    ),
  (effect) => observeAgent("definition.is-model", effect),
);

/** Checks a model for existing synchronous authoring callers.
 * @param value - Candidate selector, model, or factory.
 * @returns Whether the value is a valid model form.
 * @example if (isAgentModel(value)) use(value);
 */
export function isAgentModel(value: unknown): value is AgentModel {
  return Effect.runSync(isAgentModelEffect(value));
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
