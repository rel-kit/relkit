import type { MaybePromise } from "@zsys/contracts";
import {
  invokeFunction as invokeEngineFunction,
  type DependencyClientSources,
  type InvocationContext,
  type InvocationHooks,
  type InvocationIdSource,
  type InvocationTarget,
} from "@zsys/engine";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@zsys/schema";
import type { InvocationRunner } from "@zsys/runtime-effect";

export interface StandaloneFunctionTarget {
  readonly id: string;
  readonly input: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly errors?: readonly { readonly id: string; readonly data: StandardSchemaV1 }[];
  readonly dependencies?: import("@zsys/engine").DependencyDeclarations;
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
  readonly env?: Readonly<Record<string, unknown>>;
  readonly clients?: DependencyClientSources;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  readonly idSource?: InvocationIdSource;
  readonly context?: InvocationHooks<Context>["context"];
  readonly hooks?: InvocationHooks<Context>;
}

/** Invokes a function descriptor through the engine's direct, transport-free path. */
export function invokeFunction<
  const Target extends StandaloneFunctionTarget,
  Context extends { readonly signal: AbortSignal } = FunctionContextOf<Target>,
>(
  target: Target,
  input: FunctionInput<Target>,
  options?: InvokeFunctionOptions<Context>,
): Promise<FunctionOutput<Target>> {
  return invokeFunctionWithRunner(target, input, options);
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
