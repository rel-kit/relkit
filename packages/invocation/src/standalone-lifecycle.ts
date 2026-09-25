import { baseExecutionContext, invokeFunctionLifecycle, invokeValueHook } from "./lifecycle.js";
import { Context, Data, Effect, Layer, Option } from "effect";
import { defaultRunner } from "./validation-defaults.js";
import { linkSignals } from "./context.js";
import { observeInvocation } from "./invocation-observability.js";
import type { InvocationRunner, InvocationTarget } from "./contracts.js";
import type { StandaloneLifecycleOptions } from "./standalone-lifecycle.types.js";

export type { StandaloneLifecycleOptions } from "./standalone-lifecycle.types.js";

/** Tagged failure from the injected lifecycle runner.
 * @example Effect.catchTag(runStandaloneLifecycleEffect(options), "StandaloneLifecycleFailure", () => Effect.void);
 */
export class StandaloneLifecycleFailure extends Data.TaggedError("StandaloneLifecycleFailure")<{
  readonly phase: "before" | "handler" | "after";
  readonly cause: unknown;
  readonly message: string;
}> {}

/** Substitutable runner for sequential standalone hooks and handler.
 * @example Effect.provide(runStandaloneLifecycleEffect(options), StandaloneLifecycleRunnerLive);
 */
export class StandaloneLifecycleRunner extends Context.Service<
  StandaloneLifecycleRunner,
  InvocationRunner
>()("relkit/invocation/StandaloneLifecycleRunner") {}

/** Live runner for standalone lifecycle Effects.
 * @example Effect.runPromise(Effect.provide(runStandaloneLifecycleEffect(options), StandaloneLifecycleRunnerLive));
 */
export const StandaloneLifecycleRunnerLive = Layer.succeed(StandaloneLifecycleRunner, defaultRunner);

/** Runs before hook, handler, and after hook in dependency order.
 * @param options - Target, context, signal, and runner.
 * @returns Validated output or `StandaloneLifecycleFailure` with the original cause.
 * @example await Effect.runPromise(runStandaloneLifecycleEffect(options));
 */
export function runStandaloneLifecycleEffect<
  Input,
  Output,
  Context extends { readonly signal: AbortSignal },
>(options: StandaloneLifecycleOptions<Input, Output, Context>): Effect.Effect<unknown, StandaloneLifecycleFailure> {
  return observeInvocation("standalone.lifecycle", Effect.gen(function* () {
    const provided = yield* Effect.serviceOption(StandaloneLifecycleRunner);
    const runner = Option.isSome(provided) ? provided.value : options.runner;
    const hookContext = baseExecutionContext(options.context) as unknown as Context;
    const input = yield* runPhase("before", runner, invokeValueHook({
      hook: options.toolHooks?.onBefore,
      value: options.input,
      schema: options.target.input,
      context: hookContext,
      ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
    }), options.signal);
    const output = yield* runPhase("handler", runner, invokeFunctionLifecycle({
      target: options.target as InvocationTarget<unknown, unknown, Context>,
      input,
      context: options.context,
      ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
    }), options.signal);
    return yield* runPhase("after", runner, invokeValueHook({
      hook: options.toolHooks?.onAfter,
      value: output,
      schema: options.target.output,
      context: hookContext,
      ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
    }), options.signal);
  }));
}

/** Promise compatibility adapter for standalone lifecycle execution.
 * @param options - Target, context, signal, and runner.
 * @returns Validated output.
 * @throws The original hook, handler, or runner failure.
 * @example await runStandaloneLifecycle(options);
 */
export async function runStandaloneLifecycle<
  Input,
  Output,
  Context extends { readonly signal: AbortSignal },
>(options: StandaloneLifecycleOptions<Input, Output, Context>): Promise<unknown> {
  try { return await Effect.runPromise(runStandaloneLifecycleEffect(options)); }
  catch (cause) {
    if (cause instanceof StandaloneLifecycleFailure) throw cause.cause;
    throw cause;
  }
}

function runPhase(
  phase: "before" | "handler" | "after",
  runner: InvocationRunner,
  effect: Effect.Effect<unknown, unknown>,
  signal: AbortSignal,
): Effect.Effect<unknown, StandaloneLifecycleFailure> {
  return Effect.suspend(() => {
    let cancel: (() => void) | undefined;
    return Effect.onInterrupt(Effect.tryPromise({
      try: (fiberSignal) => {
        const controller = new AbortController();
        const unlink = linkSignals(controller, [signal, fiberSignal]);
        cancel = () => { controller.abort(fiberSignal.reason); unlink(); };
        try {
          return Promise.resolve(runner.run(effect, { signal: controller.signal })).finally(unlink);
        } catch (cause) {
          unlink();
          throw cause;
        }
      },
      catch: (cause) => new StandaloneLifecycleFailure({
        phase, cause, message: `Standalone ${phase} phase failed`,
      }),
    }), () => Effect.sync(() => cancel?.()));
  });
}
