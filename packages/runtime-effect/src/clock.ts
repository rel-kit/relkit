import type { PublicClock, PublicClockRunner } from "./clock.types.js";
export type { PublicClock, PublicClockRunner } from "./clock.types.js";
import { Clock as EffectClock, Duration, Effect } from "effect";
import { observeExecution } from "./operation.js";

/**
 * Bridges the active Effect clock to the Promise-based public context contract.
 * @param clock - Generation-owned clock, replaceable with TestClock.
 * @param runner - Caller-owned execution boundary.
 * @param signal - Cancellation inherited by sleeps.
 * @returns A synchronous now getter and interruptible Promise sleep.
 * @remarks Invalid durations reject with RangeError before scheduling work.
 * @see createPublicClockEffect for the checked runtime ownership example.
 */
export function createPublicClock(
  clock: EffectClock.Clock,
  runner: PublicClockRunner,
  signal?: AbortSignal,
): PublicClock {
  return Object.freeze({
    now: () => new Date(clock.currentTimeMillisUnsafe()),
    sleep: (milliseconds: number): Promise<void> => {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        return Promise.reject(new RangeError("sleep duration must be finite and non-negative"));
      }
      const options = signal === undefined ? undefined : { signal };
      return runner.run(
        observeExecution("runtime", "clock.sleep", clock.sleep(Duration.millis(milliseconds))),
        options,
      );
    },
  });
}

/**
 * Captures the active Effect clock for a Promise-based context.
 * @param runner - Caller-owned runtime execution boundary.
 * @param signal - Cancellation inherited by sleeps.
 * @returns A lazy clock bridge preserving the caller's clock configuration.
 * @example
 * ```ts
 * import { Layer, ManagedRuntime } from "effect";
 * import { createPublicClockEffect } from "@relkit/runtime-effect";
 * const runtime = ManagedRuntime.make(Layer.empty);
 * try {
 *   const clock = await runtime.runPromise(createPublicClockEffect({
 *     run: (effect, options) => runtime.runPromise(effect, options),
 *   }));
 *   await clock.sleep(1);
 * } finally { await runtime.dispose(); }
 * ```
 */
export function createPublicClockEffect(
  runner: PublicClockRunner,
  signal?: AbortSignal,
): Effect.Effect<PublicClock> {
  return observeExecution(
    "runtime",
    "clock.bridge",
    Effect.clockWith((clock) => Effect.succeed(createPublicClock(clock, runner, signal))),
  );
}
