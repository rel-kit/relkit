import type {
  CombinedSignals,
  DeterministicClockService,
  ClockWaiter,
} from "./runtime-clock.types.js";
import { Clock as EffectClock, Context, Duration, Effect, Layer, Ref } from "effect";

/**
 * Creates a manually controlled native Effect clock without wall-time polling.
 * @param startTime - Finite initial manual-clock timestamp.
 * @returns The clock service, public manual-time facade and native invocation runner.
 */
export function createDeterministicClock(startTime: number): DeterministicClockService {
  if (!Number.isFinite(startTime)) throw new TypeError("startTimeMs must be finite");
  const state = Ref.makeUnsafe({
    current: startTime,
    monotonic: startTime * 1_000_000,
    waiting: [] as ClockWaiter[],
  });
  const waiting = Ref.getUnsafe(state).waiting;
  const service: EffectClock.Clock = {
    currentTimeMillisUnsafe: () => Ref.getUnsafe(state).current,
    currentTimeMillis: Effect.sync(() => Ref.getUnsafe(state).current),
    currentTimeNanosUnsafe: () => BigInt(Math.trunc(Ref.getUnsafe(state).current * 1_000_000)),
    currentTimeNanos: Effect.sync(() =>
      BigInt(Math.trunc(Ref.getUnsafe(state).current * 1_000_000)),
    ),
    monotonicTimeNanosUnsafe: () => BigInt(Math.trunc(Ref.getUnsafe(state).monotonic)),
    monotonicTimeNanos: Effect.sync(() => BigInt(Math.trunc(Ref.getUnsafe(state).monotonic))),
    sleep: (duration) => {
      const milliseconds = Duration.toMillis(duration);
      if (milliseconds <= 0) return Effect.void;
      return Effect.callback<void>((resume) => {
        const entry = { at: Ref.getUnsafe(state).current + milliseconds, resume, done: false };
        waiting.push(entry);
        waiting.sort((left, right) => left.at - right.at);
        return Effect.sync(() => {
          entry.done = true;
          const index = waiting.indexOf(entry);
          if (index >= 0) waiting.splice(index, 1);
        });
      });
    },
  };
  /**
   * Advances manual time after letting admitted fibers register their sleeps.
   * @param milliseconds Finite non-negative domain duration.
   * @returns Completion after due sleepers resume without a wall-time timer.
   */
  const advance = async (milliseconds: number): Promise<void> => {
    validateAdvance(milliseconds);
    await Effect.runPromise(Effect.yieldNow);
    Ref.getUnsafe(state).current += milliseconds;
    Ref.getUnsafe(state).monotonic += milliseconds * 1_000_000;
    releaseWaiting(Ref.getUnsafe(state).current);
    await Promise.resolve();
  };
  /**
   * Replaces wall time while retaining a monotonic scheduling clock.
   * @param timestamp Finite requested domain timestamp.
   * @returns Completion after due sleepers resume.
   */
  const setTime = async (timestamp: number): Promise<void> => {
    if (!Number.isFinite(timestamp)) throw new TypeError("clock timestamp must be finite");
    await Effect.runPromise(Effect.yieldNow);
    if (timestamp >= Ref.getUnsafe(state).current)
      Ref.getUnsafe(state).monotonic += (timestamp - Ref.getUnsafe(state).current) * 1_000_000;
    Ref.getUnsafe(state).current = timestamp;
    releaseWaiting(timestamp);
    await Promise.resolve();
  };
  const clock = Object.freeze({
    now: () => new Date(Ref.getUnsafe(state).current),
    currentTimeMs: () => Ref.getUnsafe(state).current,
    advance,
    setTime,
  });
  return TestDeterministicClock.of({
    service,
    clock,
    run: (effect, options) =>
      Effect.runPromise(Effect.provideService(effect, EffectClock.Clock, service), options),
  });

  /**
   * Resumes deterministic sleeps whose deadlines have become due.
   * @param timestamp - Finite requested domain timestamp.
   * @returns Nothing after removing and completing every due waiter.
   */
  function releaseWaiting(timestamp: number): void {
    for (const entry of [...waiting]) {
      if (entry.done || entry.at > timestamp) continue;
      entry.done = true;
      const index = waiting.indexOf(entry);
      if (index >= 0) waiting.splice(index, 1);
      entry.resume(Effect.void);
    }
  }
}

/**
 * Checks manual clock advancement before changing domain time.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns Nothing for a finite non-negative duration.
 */
function validateAdvance(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError("clock advance must be finite and non-negative");
  }
}

/**
 * Combines cancellation sources without retaining their listeners after work.
 * @param signals - Native cancellation sources whose listeners are explicitly disposed.
 * @returns One signal and an explicit listener cleanup hook.
 */
export function combineSignals(...signals: (AbortSignal | undefined)[]): CombinedSignals {
  const controller = new AbortController();
  const listeners: Array<readonly [AbortSignal, () => void]> = [];
  for (const signal of signals) {
    if (signal === undefined) continue;
    const abort = () => controller.abort(signal.reason);
    if (signal.aborted) abort();
    else {
      signal.addEventListener("abort", abort, { once: true });
      listeners.push([signal, abort]);
    }
  }
  return {
    signal: controller.signal,
    dispose: () =>
      listeners.forEach(([signal, abort]) => signal.removeEventListener("abort", abort)),
  };
}

/** Manual time and native clock scheduling belong to one deterministic owner. */
export class TestDeterministicClock extends Context.Service<
  TestDeterministicClock,
  DeterministicClockService
>()("relkit/testing/DeterministicClock") {}

/**
 * Provides a replaceable clock service from the native manual-time implementation.
 * @param startTime Finite initial test timestamp in milliseconds.
 * @returns A synchronous service Layer retaining native scheduling semantics.
 */
export function deterministicClockLayer(startTime: number = 0) {
  return Layer.sync(TestDeterministicClock, () => createDeterministicClock(startTime));
}
