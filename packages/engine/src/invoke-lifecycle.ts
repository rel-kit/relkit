import { Effect } from "effect";
import {
  baseExecutionContext,
  invokeFunctionLifecycle,
  invokeValueHook,
  normalizeFailure,
  resolveServicePolicy,
  type InvocationRunner,
  type InvocationValueHooks,
  type ServicePolicySource,
} from "@zsys/invocation";
import { runServiceHandler } from "./service-runtime.js";
import type { InvocationTarget } from "./invoke-types.js";

interface LifecycleOptions<Context extends { readonly signal: AbortSignal }> {
  readonly target: InvocationTarget<unknown, unknown, Context>;
  readonly input: unknown;
  readonly context: Context;
  readonly toolHooks?: InvocationValueHooks<Context>;
  readonly servicePolicies?: ServicePolicySource;
  readonly deadline?: number;
  readonly runner: InvocationRunner;
  readonly signal: AbortSignal;
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
  const policy = resolveServicePolicy(options.target, options.servicePolicies);
  const output =
    policy === undefined
      ? yield* invokeHandler(options.context)
      : yield* Effect.tryPromise({
          try: () =>
            runServiceHandler(
              policy,
              input,
              options.context,
              invokeHandler,
              options.runner,
              options.signal,
            ),
          catch: (cause) => normalizeFailure(cause, { signal: options.signal }),
        });
  return yield* invokeValueHook({
    hook: options.toolHooks?.onAfter,
    value: output,
    schema: options.target.output,
    context: hookContext,
    ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
    onSignal: options.onSignal,
  });
});
