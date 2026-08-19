import type { InvocationContext, InvocationTarget, InvokeOptions } from "./invoke-types.js";
import { invoke } from "./invoke.js";

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
