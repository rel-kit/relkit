import type { InvocationValueHooks } from "@relkit/invocation";
import type { InvocationTarget, TaskLifecycleHooks } from "./invoke-types.js";

/** Validated handler context and lifecycle policies for one execution. */
export interface LifecycleOptions<Context extends { readonly signal: AbortSignal }> {
  readonly target: InvocationTarget<unknown, unknown, Context>;
  readonly input: unknown;
  readonly context: Context;
  readonly toolHooks?: InvocationValueHooks<Context>;
  readonly deadline?: number;
  readonly onSignal: (signal: AbortSignal) => void;
  readonly isSuspension?: (cause: unknown) => boolean;
  readonly skipInputValidation?: boolean;
  readonly taskLifecycle?: TaskLifecycleHooks<Context>;
}
