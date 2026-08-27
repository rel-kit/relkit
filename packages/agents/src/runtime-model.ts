import { AgentRuntimeError } from "./runtime-errors.js";

const DEFAULT_MAX_INPUT_BYTES = 64 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024;

export function resolveRuntimeModel(options: {
  readonly selector?: string;
  readonly registry: unknown;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
}): {
  readonly id: string;
  readonly model: import("ai").LanguageModel;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
} {
  const maxInputBytes = boundedLimit(options.maxInputBytes, DEFAULT_MAX_INPUT_BYTES);
  const maxOutputBytes = boundedLimit(options.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES);
  const registry = isRecord(options.registry)
    ? (options.registry as { readonly resolveModel?: (selector?: string) => unknown })
    : undefined;
  if (registry === undefined || typeof registry.resolveModel !== "function") return unavailable();
  const selected = registry.resolveModel(options.selector);
  if (!isRecord(selected) || typeof selected.id !== "string" || selected.model === undefined) {
    return unavailable();
  }
  return {
    id: selected.id,
    model: selected.model as import("ai").LanguageModel,
    maxInputBytes,
    maxOutputBytes,
  };
}

function boundedLimit(value: number | undefined, providerLimit: number): number {
  const limit = value ?? providerLimit;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > providerLimit) {
    throw new AgentRuntimeError("RELKIT_AGENT_LIMIT_INVALID", "Agent content limit is invalid");
  }
  return limit;
}

function unavailable(): never {
  throw new AgentRuntimeError("RELKIT_AGENT_MODEL_UNAVAILABLE", "Agent model is unavailable");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
