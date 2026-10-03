import type { InvocationContext, InvokeOptions } from "./invoke-types.js";

/** Generic recursive invocation boundary used by the shared dispatcher. */
export type InvokeNext = <
  NextInput = unknown,
  NextOutput = unknown,
  NextContext extends { readonly signal: AbortSignal } = InvocationContext,
>(
  options: InvokeOptions<NextInput, NextOutput, NextContext>,
) => Promise<NextOutput>;
