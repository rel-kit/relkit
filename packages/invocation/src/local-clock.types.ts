import type { Effect } from "effect";
import type { PublicClock } from "./contracts.js";
import type { LocalClockFailure } from "./local-clock.js";

/** Public clock with Effect operations for deterministic time tests.
 * Its sleep operation observes the invocation's cancellation signal.
 * @example await Effect.runPromise(clock.sleepEffect(100));
 */
export interface LocalEffectClock extends PublicClock {
  /** Reads time using the Effect Clock or provided callback.
   * @returns Current date, with no expected failure.
   * @example Effect.runSync(clock.nowEffect());
   */
  readonly nowEffect: () => Effect.Effect<Date>;
  /** Sleeps using the Effect Clock and inherited abort signal.
   * @param milliseconds - Finite non-negative duration.
   * @returns Void or a tagged invalid duration or abort failure.
   * @example await Effect.runPromise(clock.sleepEffect(100));
   */
  readonly sleepEffect: (milliseconds: number) => Effect.Effect<void, LocalClockFailure>;
}
