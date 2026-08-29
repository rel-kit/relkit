import { baseExecutionContext, invokeFunctionLifecycle, invokeValueHook } from "./lifecycle.js";
import type { InvocationRunner, InvocationTarget } from "./contracts.js";
import type { InvocationValueHooks } from "./dispatcher-types.js";

interface StandaloneLifecycleOptions<
  Input,
  Output,
  Context extends { readonly signal: AbortSignal },
> {
  readonly target: InvocationTarget<Input, Output, Context>;
  readonly input: unknown;
  readonly context: Context;
  readonly toolHooks?: InvocationValueHooks<Context>;
  readonly deadline?: number;
  readonly runner: InvocationRunner;
  readonly signal: AbortSignal;
}

export async function runStandaloneLifecycle<
  Input,
  Output,
  Context extends { readonly signal: AbortSignal },
>(options: StandaloneLifecycleOptions<Input, Output, Context>): Promise<unknown> {
  const hookContext = baseExecutionContext(options.context) as unknown as Context;
  const input = await options.runner.run(
    invokeValueHook({
      hook: options.toolHooks?.onBefore,
      value: options.input,
      schema: options.target.input,
      context: hookContext,
      ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
    }),
    { signal: options.signal },
  );
  const invokeHandler = (context: unknown) =>
    options.runner.run(
      invokeFunctionLifecycle({
        target: options.target as InvocationTarget<unknown, unknown, Context>,
        input,
        context: context as Context,
        ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
      }),
      { signal: options.signal },
    );
  const output = await invokeHandler(options.context);
  return options.runner.run(
    invokeValueHook({
      hook: options.toolHooks?.onAfter,
      value: output,
      schema: options.target.output,
      context: hookContext,
      ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
    }),
    { signal: options.signal },
  );
}
