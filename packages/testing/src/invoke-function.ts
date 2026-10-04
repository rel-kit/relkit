import type {
  StandaloneFunctionTarget,
  FunctionInput,
  FunctionOutput,
  FunctionContextOf,
  InvokeFunctionOptions,
} from "./invoke-function.types.js";
export type {
  StandaloneFunctionTarget,
  FunctionInput,
  FunctionOutput,
  FunctionContextOf,
  InvokeFunctionOptions,
} from "./invoke-function.types.js";

import {
  invokeFunction as invokeEngineFunction,
  type InvocationHooks,
  type InvocationTarget,
} from "@relkit/engine";

import type { InvocationRunner } from "@relkit/runtime-effect";
import { createTestFakes, type TestFakes } from "./fakes.js";
import { createTestStateRoot } from "./state-root.js";

/**
 * Invokes a function descriptor through the engine's direct, transport-free path.
 *
 * @example
 * ```ts
 * import { defineFunction } from "@relkit/app/functions";
 * import { z } from "@relkit/app/schema";
 * import { invokeFunction } from "@relkit/testing";
 *
 * export async function greetingExample(): Promise<string> {
 *   const greet = defineFunction({
 *     id: "greet", input: z.string(), output: z.string(),
 *     handler: async (name) => `Hello ${name}`,
 *   });
 *   return invokeFunction(greet, "Ada");
 * }
 * ```
 * @category Testing
 * @since 0.1.0
 * @typeParam Target - Descriptor carrying native input/output/context inference.
 * @typeParam Context - Caller context patch consumed by engine hooks.
 * @param target - Native target descriptor retaining validation and dependency contracts.
 * @param input - Declared input passed through the owning schema authority.
 * @param options - Explicit configuration and native dependencies for this test owner.
 * @returns The validated native result or original mapped invocation failure.
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
  let fakes: TestFakes | undefined;
  /**
   * Releases native child storage before removing its temporary parent root.
   * @returns Completion after every acquired fake owner has closed and root cleanup runs.
   */
  const release = async (): Promise<void> => {
    try {
      await fakes?.close();
    } finally {
      state.cleanup(false);
    }
  };
  try {
    fakes = createTestFakes(state.path, {
      ...(options?.now === undefined ? {} : { clock: options.now }),
    });
    return invokeFunctionWithRunner(target, input, { ...options, clients: fakes.clients }).then(
      async (value) => {
        await release();
        return value;
      },
      async (error) => {
        await release().catch(() => undefined);
        throw error;
      },
    );
  } catch (error) {
    if (fakes === undefined) state.cleanup(false);
    else void release().catch(() => undefined);
    throw error;
  }
}

/**
 * Invokes the existing engine validation path with an explicit Effect runner.
 * @typeParam Target - Descriptor carrying native input/output/context inference.
 * @typeParam Context - Caller context patch consumed by engine hooks.
 * @param target - Native target descriptor retaining validation and dependency contracts.
 * @param input - Declared input passed through the owning schema authority.
 * @param options - Explicit configuration and native dependencies for this test owner.
 * @param runner - Injected Effect invocation runner.
 * @returns The validated descriptor result, preserving native rejection identity.
 */
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

/**
 * Adds the validated context factory without discarding existing engine hooks.
 * @typeParam Context - Caller context patch consumed by engine hooks.
 * @param hooks - Caller-native hooks forwarded without changing ordering.
 * @param context - Native invocation context including cancellation and deadline.
 * @returns Hooks that bind the test context at invocation admission.
 */
function withContextHook<Context extends { readonly signal: AbortSignal }>(
  hooks: InvocationHooks<Context> | undefined,
  context: InvocationHooks<Context>["context"] | undefined,
): InvocationHooks<Context> | undefined {
  if (context === undefined) return hooks;
  return { ...(hooks ?? {}), context };
}

/**
 * Copies explicit environment values without consulting process environment.
 * @param env - Explicit environment values for the native invocation.
 * @returns An immutable environment record for this invocation.
 */
function freezeEnv(
  env: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  if (env === undefined) return Object.freeze({});
  if (env === null || typeof env !== "object" || Array.isArray(env)) {
    throw new TypeError("Function invocation env must be an object");
  }
  return Object.freeze({ ...env });
}

/**
 * Checks whether the descriptor requires runtime dependency resolution.
 * @param target - Native target descriptor retaining validation and dependency contracts.
 * @returns True when a declared dependency needs an engine client.
 */
function hasDependencies(target: StandaloneFunctionTarget): boolean {
  return (
    (target.publishes?.length ?? 0) > 0 ||
    Object.values(target.dependencies ?? {}).some(
      (category) => category !== undefined && Object.keys(category).length > 0,
    )
  );
}
