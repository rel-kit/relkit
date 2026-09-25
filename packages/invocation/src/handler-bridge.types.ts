import type { MaybePromise } from "@relkit/contracts";
export type { InvocationFailure } from "./failure.types.js";

/** User handler and lifecycle controls bridged into an Effect fiber.
 * The handler receives a linked signal that aborts with its parent or fiber.
 * @example await Effect.runPromise(invokeUserHandler({ handler, input, publicContext }));
 */
export interface HandlerBridgeOptions<Input, Output, Context extends object> {
  /** Runs the user handler under the linked signal.
   * @param input - Validated input.
   * @param context - Public context with linked signal.
   * @returns Handler output or rejection.
   * @example handler: async (input) => input;
   */
  readonly handler: (input: Input, context: Context) => MaybePromise<Output>;
  readonly input: Input;
  readonly publicContext: Context;
  readonly deadline?: number;
  readonly timeoutMs?: number;
  /** Observes the linked handler signal before work starts.
   * @param signal - Handler cancellation signal.
   * @returns Void.
   * @example onSignal: (signal) => console.log(signal.aborted);
   */
  readonly onSignal?: (signal: AbortSignal) => void;
  /** Recognizes native suspension outcomes.
   * @param cause - Candidate handler outcome.
   * @returns Whether it represents suspension.
   * @example isSuspension: isNativeSuspension;
   */
  readonly isSuspension?: (cause: unknown) => boolean;
}

/** Optional native suspension detector for handler outcomes.
 * A recognized suspension remains distinct from a handler failure.
 * @example const options: SuspensionOptions = { isSuspension: isNativeSuspension };
 */
export interface SuspensionOptions {
  /** Recognizes native suspension outcomes.
   * @param cause - Candidate value.
   * @returns Whether it represents suspension.
   * @example isSuspension: isNativeSuspension;
   */
  readonly isSuspension?: (cause: unknown) => boolean;
}
