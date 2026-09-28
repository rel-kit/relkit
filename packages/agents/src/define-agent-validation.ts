import { isDescriptor } from "@relkit/contracts";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { agentDefinitionFailure } from "./define-agent-error.js";
import { isAgentInstructions } from "./define-agent-support.js";
import { isAgentSchema, isPositiveInteger, isRecord } from "./agent-validation.js";
import { isAgentModel } from "./define-agent-native.js";
import { normalizeModelSelector } from "./model-selection.js";
import type { AgentDescriptor } from "./define-agent.js";
import type { AgentModel } from "./define-agent-native.js";

type AgentAny = AgentDescriptor<string, unknown, unknown>;

/** Checks the complete runtime shape of an agent descriptor.
 * @param value - Candidate descriptor.
 * @returns An Effect with a boolean and no typed failure.
 * @example Effect.runSync(isAgentDescriptorEffect(candidate));
 */
export const isAgentDescriptorEffect = Effect.fn("Agents.definition.isDescriptor")(
  (value: unknown) => Effect.sync(() => isAgentDescriptorValue(value)),
  (effect) => observeAgent("definition.is-descriptor", effect),
);

/** Checks a descriptor for existing synchronous authoring callers.
 * @param value - Candidate descriptor.
 * @returns Whether the value is an agent descriptor.
 * @example if (isAgentDescriptor(candidate)) use(candidate);
 */
export function isAgentDescriptor(value: unknown): value is AgentAny {
  return Effect.runSync(isAgentDescriptorEffect(value));
}

function isAgentDescriptorValue(value: unknown): boolean {
  if (!isRecord(value) || Object.hasOwn(value, "handler") || !isDescriptor(value, "agent")) {
    return false;
  }
  const graph = value.execution === "graph";
  return (
    isAgentSchema(value.input) &&
    isAgentSchema(value.output) &&
    isAgentModelSelector(value.model) &&
    (graph ? value.instructions === "" : isAgentInstructions(value.instructions)) &&
    Array.isArray(value.tools) &&
    Array.isArray(value.middleware) &&
    isRecord(value.limits) &&
    isPositiveInteger(value.limits.maxSteps) &&
    isPositiveInteger(value.limits.maxToolCalls) &&
    isPositiveInteger(value.limits.timeoutMs) &&
    (value.client === undefined || value.stateProfile !== undefined)
  );
}

/** Requires a valid agent descriptor.
 * @param value - Candidate descriptor.
 * @returns An Effect with void or AgentDefinitionFailure.
 * @example Effect.runSync(assertAgentDescriptorEffect(agent));
 */
export const assertAgentDescriptorEffect = Effect.fn("Agents.definition.assertDescriptor")(
  (value: unknown) => Effect.try({
    try: () => {
      if (!isAgentDescriptorValue(value)) throw new TypeError("Invalid agent descriptor");
    },
    catch: agentDefinitionFailure,
  }),
  (effect) => observeAgent("definition.assert-descriptor", effect),
);

/** Requires a descriptor for existing synchronous authoring callers.
 * @param value - Candidate descriptor.
 * @returns Nothing when the descriptor is valid.
 * @throws TypeError when the descriptor is invalid.
 * @example assertAgentDescriptor(candidate);
 */
export function assertAgentDescriptor(value: unknown): asserts value is AgentAny {
  Effect.runSync(assertAgentDescriptorEffect(value).pipe(
    Effect.catchTag("AgentDefinitionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

/** Normalizes the selector of a string model definition.
 * @param value - String selector, model object, factory, or undefined.
 * @returns An Effect with the normalized model or AgentDefinitionFailure.
 * @example Effect.runSync(normalizeAgentModelEffect("openai:gpt"));
 */
export const normalizeAgentModelEffect = Effect.fn("Agents.definition.normalizeModel")(
  (value: AgentModel | undefined) => Effect.try({
    try: () => value === undefined || typeof value !== "string" ? value : normalizeModelSelector(value),
    catch: agentDefinitionFailure,
  }),
  (effect) => observeAgent("definition.normalize-model", effect),
);

/** Normalizes a model for existing synchronous authoring callers.
 * @param value - String selector, model object, factory, or undefined.
 * @returns The normalized model.
 * @throws The original invalid selector error.
 * @example const model = normalizeAgentModel("openai:gpt");
 */
export function normalizeAgentModel(value: AgentModel | undefined): AgentModel | undefined {
  return Effect.runSync(normalizeAgentModelEffect(value).pipe(
    Effect.catchTag("AgentDefinitionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function isAgentModelSelector(value: unknown): value is AgentModel | undefined {
  if (value === undefined) return true;
  if (typeof value !== "string") return isAgentModel(value);
  try {
    return normalizeModelSelector(value) === value;
  } catch {
    return false;
  }
}
