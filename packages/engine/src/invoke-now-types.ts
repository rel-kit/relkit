import type { InvocationContext, InvokeOptions } from "./invoke-types.js";

export type InvokeNext = <
  NextInput = unknown,
  NextOutput = unknown,
  NextContext extends { readonly signal: AbortSignal } = InvocationContext,
>(
  options: InvokeOptions<NextInput, NextOutput, NextContext>,
) => Promise<NextOutput>;
