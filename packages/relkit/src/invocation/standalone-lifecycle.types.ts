import type { InvocationRunner, InvocationTarget } from "./contracts.js";
import type { InvocationValueHooks } from "./dispatcher.types.js";

/** Inputs and runner for standalone hook and handler execution.
 * Before, handler, and after phases run in order under the same signal.
 * @typeParam Input - Target input type.
 * @typeParam Output - Target output type.
 * @typeParam Context - Context supplied to hooks and handler.
 * @example await runStandaloneLifecycle({ target, input, context, runner, signal });
 */
export interface StandaloneLifecycleOptions<
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
