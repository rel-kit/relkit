import { Effect } from "effect";
import {
  baseExecutionContext,
  invokeFunctionLifecycle,
  invokeValueHook,
  type InvocationValueHooks,
} from "@relkit/invocation";
import type { InvocationTarget } from "./invoke-types.js";

interface LifecycleOptions<Context extends { readonly signal: AbortSignal }> {
  readonly target: InvocationTarget<unknown, unknown, Context>;
  readonly input: unknown;
  readonly context: Context;
  readonly toolHooks?: InvocationValueHooks<Context>;
  readonly deadline?: number;
  readonly onSignal: (signal: AbortSignal) => void;
}

export const runConfiguredLifecycle = Effect.fnUntraced(function* <
  Context extends { readonly signal: AbortSignal },
>(options: LifecycleOptions<Context>) {
  const hookContext = baseExecutionContext(options.context) as unknown as Context;
  const input = yield* invokeValueHook({
    hook: options.toolHooks?.onBefore,
    value: options.input,
    schema: options.target.input,
    context: hookContext,
    ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
    onSignal: options.onSignal,
  });
  const invokeHandler = (context: unknown) =>
    invokeFunctionLifecycle({
      target: options.target,
      input,
      context: context as Context,
      ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
      onSignal: options.onSignal,
    });
  const output = yield* invokeHandler(options.context);
  return yield* invokeValueHook({
    hook: options.toolHooks?.onAfter,
    value: output,
    schema: options.target.output,
    context: hookContext,
    ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
    onSignal: options.onSignal,
  });
});
