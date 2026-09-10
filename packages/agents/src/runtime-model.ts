import { AgentRuntimeError } from "./runtime-errors.js";

const DEFAULT_MAX_INPUT_BYTES = 64 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024;

export async function resolveRuntimeModel(options: {
  readonly model?: import("./define-agent-native.js").AgentModel;
  readonly registry: unknown;
  readonly environment: Readonly<Record<string, unknown>>;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
}): Promise<{
  readonly id: string;
  readonly model: string | import("@langchain/core/language_models/base").LanguageModelLike;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
}> {
  const { maxInputBytes, maxOutputBytes } = resolveAgentContentLimits(options);
  if (typeof options.model === "function") {
    const model = await options.model(options.environment);
    return { id: nativeId(model), model: asLanguageModel(model), maxInputBytes, maxOutputBytes };
  }
  if (options.model !== undefined && typeof options.model !== "string") {
    return {
      id: nativeId(options.model),
      model: asLanguageModel(options.model),
      maxInputBytes,
      maxOutputBytes,
    };
  }
  const registry = isRecord(options.registry)
    ? (options.registry as { readonly resolveModel?: (selector?: string) => unknown })
    : undefined;
  if (registry === undefined || typeof registry.resolveModel !== "function") {
    if (typeof options.model === "string") {
      return { id: options.model, model: options.model, maxInputBytes, maxOutputBytes };
    }
    return unavailable();
  }
  const selected = await registry.resolveModel(options.model);
  if (!isRecord(selected) || typeof selected.id !== "string" || selected.model === undefined) {
    return unavailable();
  }
  return {
    id: selected.id,
    model: selected.model as import("@langchain/core/language_models/base").LanguageModelLike,
    maxInputBytes,
    maxOutputBytes,
  };
}

export function resolveAgentContentLimits(options: {
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
}): { readonly maxInputBytes: number; readonly maxOutputBytes: number } {
  return {
    maxInputBytes: boundedLimit(options.maxInputBytes, DEFAULT_MAX_INPUT_BYTES),
    maxOutputBytes: boundedLimit(options.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES),
  };
}

function nativeId(model: import("./define-agent-native.js").AgentLanguageModel): string {
  const value = model as {
    readonly name?: unknown;
    readonly constructor?: { readonly name?: unknown };
  };
  const name = typeof value.name === "string" ? value.name : value.constructor?.name;
  return `native:${typeof name === "string" && name !== "" ? name : "model"}`;
}

function asLanguageModel(model: import("./define-agent-native.js").AgentLanguageModel) {
  return model as import("@langchain/core/language_models/base").LanguageModelLike;
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
