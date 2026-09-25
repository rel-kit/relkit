import type { StandardSchemaV1 } from "@relkit/schema";
import type { InvocationTarget } from "./contracts.js";
import type { InvocationValueHooks } from "./dispatcher.types.js";

/** Handler target, public context, and lifecycle validation controls.
 * Input and output validation default to enabled for a full invocation.
 * @example await invokeFunctionLifecycle({ target, input, context });
 */
export interface LifecycleOptions<Context extends { readonly signal: AbortSignal }> {
  readonly target: InvocationTarget<unknown, unknown, Context>;
  readonly input: unknown;
  readonly context: Context;
  readonly deadline?: number;
  /** Observes the linked handler signal.
   * @param signal - Handler-visible cancellation signal.
   * @returns Void.
   * @example onSignal: (signal) => console.log(signal.aborted);
   */
  readonly onSignal?: (signal: AbortSignal) => void;
  /** Recognizes a native suspension result.
   * @param cause - Handler outcome or rejection.
   * @returns Whether the value represents suspension.
   * @example isSuspension: isNativeSuspension;
   */
  readonly isSuspension?: (cause: unknown) => boolean;
  readonly validateInput?: boolean;
  readonly validateOutput?: boolean;
}

/** Tool value hook and validation inputs.
 * The hook's result is validated against the supplied schema before use.
 * @example await invokeValueHook({ hook: onBefore, value: input, schema, context });
 */
export interface ValueHookOptions<Context extends { readonly signal: AbortSignal }> {
  readonly hook: InvocationValueHooks<Context>["onBefore"];
  readonly value: unknown;
  readonly schema: StandardSchemaV1;
  readonly context: Context;
  readonly deadline?: number;
  /** Observes the linked hook signal.
   * @param signal - Hook cancellation signal.
   * @returns Void.
   * @example onSignal: (signal) => console.log(signal.aborted);
   */
  readonly onSignal?: (signal: AbortSignal) => void;
  /** Recognizes a native suspension result.
   * @param cause - Hook outcome or rejection.
   * @returns Whether the value represents suspension.
   * @example isSuspension: isNativeSuspension;
   */
  readonly isSuspension?: (cause: unknown) => boolean;
}

/** Restricted context passed to tool value hooks.
 * Managed clients are withheld from these hooks.
 * @example const signal = hookContext.signal;
 */
export interface BaseExecutionContext {
  readonly invocation: unknown;
  readonly signal: AbortSignal;
  readonly env: unknown;
  readonly log: unknown;
  readonly time: unknown;
}
