import { Clock, Data, Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { LocalEffectClock } from "./local-clock.types.js";

export type { LocalEffectClock } from "./local-clock.types.js";

/** Tagged invalid duration or abort from a local clock sleep.
 * @example Effect.catchTag(clock.sleepEffect(-1), "LocalClockFailure", () => Effect.void);
 */
export class LocalClockFailure extends Data.TaggedError("LocalClockFailure")<{
  readonly kind: "duration" | "aborted";
  readonly cause: unknown;
  readonly message: string;
}> {}

/** Creates an abort-aware clock backed by the Effect Clock.
 * @param signal - Invocation cancellation signal.
 * @param now - Optional compatibility time source.
 * @returns A public clock with direct Effect operations and no expected creation failure.
 * @example Effect.runSync(createLocalClockEffect(signal));
 */
export function createLocalClockEffect(
  signal: AbortSignal,
  now?: () => number,
): Effect.Effect<LocalEffectClock> {
  return observeInvocation("clock.create", Effect.sync(() => {
    const nowEffect = (): Effect.Effect<Date> => observeInvocation("clock.now",
      Effect.map(now === undefined ? Clock.currentTimeMillis : Effect.sync(now),
        (milliseconds) => new Date(milliseconds)));
    const sleepEffect = (milliseconds: number): Effect.Effect<void, LocalClockFailure> =>
      observeInvocation("clock.sleep", Effect.suspend(() => {
        if (!Number.isFinite(milliseconds) || milliseconds < 0)
          return Effect.fail(new LocalClockFailure({
            kind: "duration",
            cause: new RangeError("sleep duration must be finite and non-negative"),
            message: "Invalid sleep duration",
          }));
        if (signal.aborted) return Effect.fail(aborted(signal));
        return Effect.raceFirst(Effect.sleep(milliseconds), waitForAbort(signal));
      }));
    const sleep = async (milliseconds: number): Promise<void> => {
      try { await Effect.runPromise(sleepEffect(milliseconds)); }
      catch (cause) {
        if (cause instanceof LocalClockFailure) throw cause.cause;
        throw cause;
      }
    };
    return Object.freeze({
      now: () => runInvocationSync(nowEffect()),
      sleep,
      nowEffect,
      sleepEffect,
    });
  }));
}

/** Synchronous clock factory compatibility adapter.
 * @param signal - Invocation cancellation signal.
 * @param now - Optional time source, defaulting to the live Effect Clock.
 * @returns A public clock with abortable Promise sleep.
 * @example createLocalClock(new AbortController().signal);
 */
export function createLocalClock(signal: AbortSignal, now: () => number = Date.now): LocalEffectClock {
  return runInvocationSync(createLocalClockEffect(signal, now));
}

function waitForAbort(signal: AbortSignal): Effect.Effect<void, LocalClockFailure> {
  return Effect.suspend(() => {
    let remove: (() => void) | undefined;
    return Effect.callback<void, LocalClockFailure>((resume) => {
      const onAbort = (): void => resume(Effect.fail(aborted(signal)));
      remove = () => signal.removeEventListener("abort", onAbort);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    }).pipe(Effect.ensuring(Effect.sync(() => remove?.())));
  });
}

function aborted(signal: AbortSignal): LocalClockFailure {
  return new LocalClockFailure({
    kind: "aborted",
    cause: signal.reason ?? new Error("Operation aborted"),
    message: "Operation aborted",
  });
}
