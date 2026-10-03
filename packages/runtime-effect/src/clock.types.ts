import type { Effect } from "effect";

/** Synchronous wall time and cancellable Promise sleep over the active Effect clock. */
export interface PublicClock {
  /** Reads the captured clock synchronously; no scheduling or acquisition occurs.
   * @returns A new Date containing the configured wall-clock time.
   */
  readonly now: () => Date;

  /** Waits on the captured clock; rejects invalid durations or interruption.
   * @param milliseconds - Finite non-negative sleep duration.
   * @returns Completion after the requested duration, or cancellation rejection.
   */
  readonly sleep: (milliseconds: number) => Promise<void>;
}

/** Caller-owned runtime bridge; sleep does not create a separate runtime. */
export interface PublicClockRunner {
  /** Executes a sleep in the already configured runtime.
   * @param effect - Clock operation with all dependencies supplied.
   * @param options - Optional external cancellation signal.
   * @returns Completion or interruption of the sleep.
   */
  readonly run: (
    effect: Effect.Effect<void, never, never>,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<void>;
}
