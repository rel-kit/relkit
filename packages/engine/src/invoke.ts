import {
  canonicalTarget,
  resolveTarget,
} from "./invoke-utils.js";
import { invokeNow } from "./invoke-now.js";
import { lazySingleConsumerStream, isStreamOutput } from "@relkit/invocation";
import type { InvocationContext, InvokeOptions } from "./invoke-types.js";

export * from "./invoke-types.js";

export async function invoke<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
>(options: InvokeOptions<Input, Output, Context>): Promise<Output> {
  const target = canonicalTarget(resolveTarget(options));
  if (!isStreamOutput(target.output)) return invokeNow(options, false, invoke);
  return Promise.resolve(
    lazySingleConsumerStream(
      () => invokeNow({ ...options, target }, true, invoke) as Promise<AsyncIterable<unknown>>,
    ) as Output,
  );
}

export { invokeFunction } from "./invoke-function.js";
