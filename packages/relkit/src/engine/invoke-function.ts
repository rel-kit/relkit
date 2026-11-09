import type { InvocationContext, InvocationTarget, InvokeOptions } from "./invoke-types.js";
import { invoke } from "./invoke.js";

/** Invoke a target through engine validation, admission and shared execution scope.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns A Promise of validated output, rejecting with the original public execution failure.
 * @param target - Declared target whose schema and metadata govern execution.
 * @param input - Untrusted input validated before handler execution.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export function invokeFunction<
  Input,
  Output,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
>(
  target: InvocationTarget<Input, Output, Context>,
  input: unknown,
  options: Omit<InvokeOptions<Input, Output, Context>, "target" | "input"> = {},
): Promise<Output> {
  return invoke<Input, Output, Context>({ ...options, target, input });
}
