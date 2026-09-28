import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import { agentModelResolutionFailure } from "./runtime-model-error.js";
import type { AgentContentLimits, ResolvedRuntimeModel, RuntimeModelOptions } from "./runtime-model.types.js";
import type { AgentLanguageModel } from "./define-agent-native.types.js";

export type { AgentContentLimits, ResolvedRuntimeModel, RuntimeModelOptions } from "./runtime-model.types.js";

const DEFAULT_MAX_INPUT_BYTES = 64 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024;

/** Resolves a model factory, native model, registry selection, or string selector.
 * @param options - Model declaration, registry, environment, and content limits.
 * @returns An Effect with a model and limits or AgentModelResolutionFailure.
 * @example Effect.runPromise(resolveRuntimeModelEffect({ model: "test", registry: null, environment: {} }));
 */
export const resolveRuntimeModelEffect = Effect.fn("Agents.runtime.resolveModel")(
  function* (options: RuntimeModelOptions) {
    const { maxInputBytes, maxOutputBytes } = yield* resolveAgentContentLimitsEffect(options);
    if (typeof options.model === "function") {
      const factory = options.model;
      const model = yield* Effect.tryPromise({
        try: () => Promise.resolve(factory(options.environment)),
        catch: agentModelResolutionFailure,
      });
      return yield* Effect.try({
        try: (): ResolvedRuntimeModel => ({ id: nativeId(model), model: asLanguageModel(model), maxInputBytes, maxOutputBytes }),
        catch: agentModelResolutionFailure,
      });
    }
    if (options.model !== undefined && typeof options.model !== "string") {
      return yield* Effect.try({
        try: (): ResolvedRuntimeModel => ({
          id: nativeId(options.model as AgentLanguageModel),
          model: asLanguageModel(options.model as AgentLanguageModel),
          maxInputBytes,
          maxOutputBytes,
        }),
        catch: agentModelResolutionFailure,
      });
    }
    const registry = isRecord(options.registry)
      ? (options.registry as { readonly resolveModel?: (selector?: string) => unknown })
      : undefined;
    if (registry === undefined || typeof registry.resolveModel !== "function") {
      if (typeof options.model === "string") {
        return { id: options.model, model: options.model, maxInputBytes, maxOutputBytes };
      }
      return yield* Effect.fail(unavailable());
    }
    const selected = yield* Effect.tryPromise({
      try: () => Promise.resolve(registry.resolveModel!(options.model as string | undefined)),
      catch: agentModelResolutionFailure,
    });
    if (!isRecord(selected) || typeof selected.id !== "string" || selected.model === undefined) {
      return yield* Effect.fail(unavailable());
    }
    return {
      id: selected.id,
      model: selected.model as LanguageModelLike,
      maxInputBytes,
      maxOutputBytes,
    };
  },
  (effect) => observeAgent("runtime.resolve-model", effect),
);

/** Resolves a model for existing Promise runtime callers.
 * @param options - Model declaration, registry, environment, and content limits.
 * @returns A selected model and validated limits.
 * @throws The original provider or AgentRuntimeError cause.
 * @example await resolveRuntimeModel({ model: "test", registry: null, environment: {} });
 */
export function resolveRuntimeModel(options: RuntimeModelOptions): Promise<ResolvedRuntimeModel> {
  return Effect.runPromise(resolveRuntimeModelEffect(options).pipe(
    Effect.catchTag("AgentModelResolutionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

/** Validates content byte limits against fixed package maximums.
 * @param options - Optional input and output byte limits.
 * @returns An Effect with limits or AgentModelResolutionFailure.
 * @example Effect.runSync(resolveAgentContentLimitsEffect({ maxInputBytes: 1024 }));
 */
export const resolveAgentContentLimitsEffect = Effect.fn("Agents.runtime.contentLimits")(
  (options: Pick<RuntimeModelOptions, "maxInputBytes" | "maxOutputBytes">) => Effect.try({
    try: (): AgentContentLimits => ({
      maxInputBytes: boundedLimit(options.maxInputBytes, DEFAULT_MAX_INPUT_BYTES),
      maxOutputBytes: boundedLimit(options.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES),
    }),
    catch: agentModelResolutionFailure,
  }),
  (effect) => observeAgent("runtime.content-limits", effect),
);

/** Validates content byte limits for existing synchronous runtime callers.
 * @param options - Optional input and output byte limits.
 * @returns Fixed and validated limits.
 * @throws The original AgentRuntimeError for invalid limits.
 * @example resolveAgentContentLimits({ maxInputBytes: 1024 });
 */
export function resolveAgentContentLimits(
  options: Pick<RuntimeModelOptions, "maxInputBytes" | "maxOutputBytes">,
): AgentContentLimits {
  return Effect.runSync(resolveAgentContentLimitsEffect(options).pipe(
    Effect.catchTag("AgentModelResolutionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function nativeId(model: AgentLanguageModel): string {
  const value = model as { readonly name?: unknown; readonly constructor?: { readonly name?: unknown } };
  const name = typeof value.name === "string" ? value.name : value.constructor?.name;
  return `native:${typeof name === "string" && name !== "" ? name : "model"}`;
}

function asLanguageModel(model: AgentLanguageModel): LanguageModelLike {
  return model as LanguageModelLike;
}

function boundedLimit(value: number | undefined, providerLimit: number): number {
  const limit = value ?? providerLimit;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > providerLimit) {
    throw new AgentRuntimeError("RELKIT_AGENT_LIMIT_INVALID", "Agent content limit is invalid");
  }
  return limit;
}

function unavailable() {
  return agentModelResolutionFailure(
    new AgentRuntimeError("RELKIT_AGENT_MODEL_UNAVAILABLE", "Agent model is unavailable"),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
