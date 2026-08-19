import { Clock as EffectClock, Duration, Effect } from "effect";
import type { InvocationRunner } from "@zsys/runtime-effect";
import type { TestClock } from "./runtime.js";

export function createDeterministicClock(startTime: number): {
  readonly service: EffectClock.Clock;
  readonly clock: TestClock;
  readonly run: InvocationRunner["run"];
} {
  if (!Number.isFinite(startTime)) throw new TypeError("startTimeMs must be finite");
  let current = startTime;
  let monotonic = startTime * 1_000_000;
  const waiting: Array<{
    readonly at: number;
    readonly resume: (effect: Effect.Effect<void>) => void;
    done: boolean;
  }> = [];
  const service: EffectClock.Clock = {
    currentTimeMillisUnsafe: () => current,
    currentTimeMillis: Effect.sync(() => current),
    currentTimeNanosUnsafe: () => BigInt(Math.trunc(current * 1_000_000)),
    currentTimeNanos: Effect.sync(() => BigInt(Math.trunc(current * 1_000_000))),
    monotonicTimeNanosUnsafe: () => BigInt(Math.trunc(monotonic)),
    monotonicTimeNanos: Effect.sync(() => BigInt(Math.trunc(monotonic))),
    sleep: (duration) => {
      const milliseconds = Duration.toMillis(duration);
      if (milliseconds <= 0) return Effect.void;
      return Effect.callback<void>((resume) => {
        const entry = { at: current + milliseconds, resume, done: false };
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
  const advance = async (milliseconds: number): Promise<void> => {
    validateAdvance(milliseconds);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    current += milliseconds;
    monotonic += milliseconds * 1_000_000;
    releaseWaiting(current);
    await Promise.resolve();
  };
  const setTime = async (timestamp: number): Promise<void> => {
    if (!Number.isFinite(timestamp)) throw new TypeError("clock timestamp must be finite");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (timestamp >= current) monotonic += (timestamp - current) * 1_000_000;
    current = timestamp;
    releaseWaiting(timestamp);
    await Promise.resolve();
  };
  const clock = Object.freeze({
    now: () => new Date(current),
    currentTimeMs: () => current,
    advance,
    setTime,
  });
  return {
    service,
    clock,
    run: (effect, options) =>
      Effect.runPromise(Effect.provideService(effect, EffectClock.Clock, service), options),
  };

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

function validateAdvance(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError("clock advance must be finite and non-negative");
  }
}

export function combineSignals(...signals: (AbortSignal | undefined)[]): {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
} {
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
