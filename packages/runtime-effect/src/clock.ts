import { Clock as EffectClock, Duration, Effect } from "effect";

export interface PublicClock {
  readonly now: () => Date;
  readonly sleep: (milliseconds: number) => Promise<void>;
}

export interface PublicClockRunner {
  readonly run: (
    effect: Effect.Effect<void, never, never>,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<void>;
}

/** Bridges the active Effect clock to the Promise-based public context contract. */
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
      return runner.run(clock.sleep(Duration.millis(milliseconds)), options);
    },
  });
}

/** Captures the active Effect clock for a Promise-based context. */
export function createPublicClockEffect(
  runner: PublicClockRunner,
  signal?: AbortSignal,
): Effect.Effect<PublicClock> {
  return Effect.clockWith((clock) => Effect.succeed(createPublicClock(clock, runner, signal)));
}
