import type { InvocationRecord, InvocationValidationError } from "./contracts.js";
import type { InvocationDispatchOptions } from "./dispatcher.types.js";
import type { InvocationFailure } from "./failure.js";
import type { StandaloneRecordError } from "./standalone-record.js";
import type { Effect } from "effect";

/** Completion status after a standalone invocation leaves its started state.
 * @example const outcome: StandaloneOutcome = "success";
 */
export type StandaloneOutcome = Exclude<InvocationRecord["status"], "started">;

/** Dependencies captured by a standalone invocation finalizer.
 * Unlink releases signal listeners after completion or a finalization failure.
 * @example const finish = createStandaloneFinisher({ record, options, now, settleProgress, unlink });
 */
export interface StandaloneFinisherOptions<Context extends { readonly signal: AbortSignal }> {
  readonly record: InvocationRecord;
  readonly options: InvocationDispatchOptions<Context>;
  /** Reads the completion timestamp.
   * @returns Unix time in milliseconds.
   * @example options.now();
   */
  readonly now: () => number;
  readonly settleProgress: (() => void) | undefined;
  /** Removes inherited signal listeners.
   * @returns Void.
   * @example options.unlink();
   */
  readonly unlink: () => void;
}

/** Effect and Promise surfaces for an idempotent finalizer.
 * The first finish call records the outcome; later calls do not repeat hooks.
 * @example await finisher.finish("success", undefined);
 */
export interface StandaloneFinisher {
  /** Finalizes a standalone invocation through Effect.
   * @param outcome - Final invocation status.
   * @param error - Optional validation or runtime failure.
   * @returns Void or a tagged record failure.
   * @example await Effect.runPromise(finisher.finishEffect("success", undefined));
   */
  readonly finishEffect: (
    outcome: StandaloneOutcome,
    error: InvocationValidationError | InvocationFailure | undefined,
  ) => Effect.Effect<void, StandaloneRecordError>;
  /** Finalizes a standalone invocation through the Promise adapter.
   * @param outcome - Final invocation status.
   * @param error - Optional validation or runtime failure.
   * @returns Completion of hooks and release.
   * @example await finisher.finish("success", undefined);
   */
  readonly finish: (
    outcome: StandaloneOutcome,
    error: InvocationValidationError | InvocationFailure | undefined,
  ) => Promise<void>;
}
