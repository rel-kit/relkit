import { isDescriptor } from "@relkit/contracts";
import { isAgentInstructions } from "./define-agent-support.js";
import { isAgentSchema, isPositiveInteger, isRecord } from "./agent-validation.js";
import { isAgentModel } from "./define-agent-native.js";
import { normalizeModelSelector } from "./model-selection.js";
import type { AgentDescriptor } from "./define-agent.js";
import type { AgentModel } from "./define-agent-native.js";

type AgentAny = AgentDescriptor<string, unknown, unknown>;

export function isAgentDescriptor(value: unknown): value is AgentAny {
  if (!isRecord(value) || Object.hasOwn(value, "handler") || !isDescriptor(value, "agent")) {
    return false;
  }
  const descriptor = value as AgentAny;
  const graph = (value as unknown as Record<string, unknown>).execution === "graph";
  return (
    isAgentSchema(descriptor.input) &&
    isAgentSchema(descriptor.output) &&
    isAgentModelSelector(descriptor.model) &&
    (graph ? descriptor.instructions === "" : isAgentInstructions(descriptor.instructions)) &&
    Array.isArray(descriptor.tools) &&
    Array.isArray(descriptor.middleware) &&
    isRecord(descriptor.limits) &&
    isPositiveInteger(descriptor.limits.maxSteps) &&
    isPositiveInteger(descriptor.limits.maxToolCalls) &&
    isPositiveInteger(descriptor.limits.timeoutMs) &&
    (descriptor.client === undefined || descriptor.stateProfile !== undefined)
  );
}

export function assertAgentDescriptor(value: unknown): asserts value is AgentAny {
  if (!isAgentDescriptor(value)) throw new TypeError("Invalid agent descriptor");
}

export function normalizeAgentModel(value: AgentModel | undefined): AgentModel | undefined {
  if (value === undefined || typeof value !== "string") return value;
  return normalizeModelSelector(value);
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
