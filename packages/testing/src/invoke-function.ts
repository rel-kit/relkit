import type { MaybePromise } from "@relkit/contracts";
import {
  invokeFunction as invokeEngineFunction,
  type DependencyClientSources,
  type FunctionRegistry,
  type InvocationContext,
  type InvocationHooks,
  type InvocationIdSource,
  type InvocationTarget,
} from "@relkit/engine";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { InvocationRunner } from "@relkit/runtime-effect";
import { createTestFakes } from "./fakes.js";
import { createTestStateRoot } from "./state-root.js";

export interface StandaloneFunctionTarget {
  readonly id: string;
  readonly input: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly errors?: readonly { readonly id: string; readonly data: StandardSchemaV1 }[];
  readonly dependencies?: import("@relkit/engine").DependencyDeclarations;
  readonly publishes?: readonly string[];
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly handler: (...arguments_: readonly never[]) => MaybePromise<unknown>;
}

export type FunctionInput<Target extends { readonly input: StandardSchemaV1 }> = InferInput<
  Target["input"]
>;

export type FunctionOutput<Target extends { readonly output: StandardSchemaV1 }> = InferOutput<
  Target["output"]
>;

export type FunctionContextOf<Target> =
  Target extends Record<"handler", (input: infer _Input, context: infer Context) => unknown>
    ? Context extends { readonly signal: AbortSignal }
      ? Context
      : InvocationContext
    : InvocationContext;

export interface InvokeFunctionOptions<Context extends { readonly signal: AbortSignal }> {
  readonly registry?: FunctionRegistry;
  readonly env?: Readonly<Record<string, unknown>>;
  readonly clients?: DependencyClientSources;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  readonly idSource?: InvocationIdSource;
  readonly context?: InvocationHooks<Context>["context"];
  readonly hooks?: InvocationHooks<Context>;
}

/**
 * Invokes a function descriptor through the engine's direct, transport-free path.
 *
 * @example
 * ```ts
 * import { defineFunction } from "@relkit/app/functions"
 * import { z } from "@relkit/app/schema"
 * import { invokeFunction } from "@relkit/testing"
 *
 * const greet = defineFunction({ id: "greet", input: z.string(), output: z.string(), handler: async (name) => `Hello ${name}` })
 * const result = await invokeFunction(greet, "Ada")
 * console.log(result)
 * ```
 * @category Testing
 * @since 0.1.0
 */
export function invokeFunction<
  const Target extends StandaloneFunctionTarget,
  Context extends { readonly signal: AbortSignal } = FunctionContextOf<Target>,
>(
  target: Target,
  input: FunctionInput<Target>,
  options?: InvokeFunctionOptions<Context>,
): Promise<FunctionOutput<Target>> {
  if (options?.clients !== undefined || !hasDependencies(target)) {
    return invokeFunctionWithRunner(target, input, options);
  }
  const state = createTestStateRoot();
  const fakes = createTestFakes(state.path, {
    ...(options?.now === undefined ? {} : { clock: options.now }),
  });
  return invokeFunctionWithRunner(target, input, { ...options, clients: fakes.clients }).finally(
    () => state.cleanup(false),
  );
}

export function invokeFunctionWithRunner<
  const Target extends StandaloneFunctionTarget,
  Context extends { readonly signal: AbortSignal } = FunctionContextOf<Target>,
>(
  target: Target,
  input: FunctionInput<Target>,
  options: InvokeFunctionOptions<Context> | undefined,
  runner?: InvocationRunner,
): Promise<FunctionOutput<Target>> {
  const env = freezeEnv(options?.env);
  const hooks = withContextHook(options?.hooks, options?.context);
  const invocationTarget = target as unknown as InvocationTarget<
    FunctionInput<Target>,
    FunctionOutput<Target>,
    Context
  >;
  return invokeEngineFunction(invocationTarget, input, {
    source: "direct",
    env,
    ...(options?.registry === undefined ? {} : { registry: options.registry }),
    ...(options?.clients === undefined ? {} : { clients: options.clients }),
    ...(options?.signal === undefined ? {} : { signal: options.signal }),
    ...(options?.now === undefined ? {} : { now: options.now }),
    ...(options?.idSource === undefined ? {} : { idSource: options.idSource }),
    ...(hooks === undefined ? {} : { hooks }),
    ...(runner === undefined ? {} : { effectRunner: runner }),
  });
}

function withContextHook<Context extends { readonly signal: AbortSignal }>(
  hooks: InvocationHooks<Context> | undefined,
  context: InvocationHooks<Context>["context"] | undefined,
): InvocationHooks<Context> | undefined {
  if (context === undefined) return hooks;
  return { ...(hooks ?? {}), context };
}

function freezeEnv(
  env: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  if (env === undefined) return Object.freeze({});
  if (env === null || typeof env !== "object" || Array.isArray(env)) {
    throw new TypeError("Function invocation env must be an object");
  }
  return Object.freeze({ ...env });
}

function hasDependencies(target: StandaloneFunctionTarget): boolean {
  return (
    (target.publishes?.length ?? 0) > 0 ||
    Object.values(target.dependencies ?? {}).some(
      (category) => category !== undefined && Object.keys(category).length > 0,
    )
  );
}
