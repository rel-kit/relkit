import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import { Cause, Effect, Schema, Stream } from "effect";
import { JobObservationTimeoutError } from "./control-errors.js";
import { observeJobs } from "./jobs-observability.js";
/** Expected run observation failure with its original cause.
 * @example if (error instanceof JobObserveFailure) console.log(error.message);
 */
export class JobObserveFailure extends Schema.TaggedError<JobObserveFailure>()(
  "Jobs.ObserveFailure",
  { cause: Schema.Defect() },
) {}
/** Creates a scoped run observation stream in Effect.
 * @param source - Native watch frames.
 * @param signal - Caller cancellation signal.
 * @param timeoutMs - Maximum wait for each frame.
 * @returns A scoped Stream or JobObserveFailure during setup or pulling.
 * @example Effect.runPromise(Effect.flatMap(observeWithTimeoutEffect(source, signal, 1000), Stream.runCollect));
 */
export const observeWithTimeoutEffect = Effect.fn("Jobs.observeWithTimeout")(
  (source: AsyncIterable<RunWatchFrame<RunSnapshot>>, signal: AbortSignal, timeoutMs: number) =>
    observeJobs("control.observeSetup", Effect.succeed(makeStream(source, signal, timeoutMs))),
);
/** Compatibility async iterable with scoped iterator cleanup.
 * @param source - Native watch frames.
 * @param signal - Caller cancellation signal.
 * @param timeoutMs - Maximum wait for each frame.
 * @returns An async iterable whose iterator owns the native observation.
 * @throws Original read, cancellation, or timeout error while consuming.
 * @example for await (const frame of observeWithTimeout(source, signal, 1000)) console.log(frame);
 */
export function observeWithTimeout(
  source: AsyncIterable<RunWatchFrame<RunSnapshot>>,
  signal: AbortSignal,
  timeoutMs: number,
): AsyncIterable<RunWatchFrame<RunSnapshot>> {
  const stream = Effect.runSync(observeWithTimeoutEffect(source, signal, timeoutMs));
  return Stream.toAsyncIterable(Stream.mapError(stream, (failure) => failure.cause));
}
/** Acquires the native iterator for the lifetime of stream consumption. */
function makeStream(
  source: AsyncIterable<RunWatchFrame<RunSnapshot>>,
  signal: AbortSignal,
  timeoutMs: number,
) {
  return Stream.scoped(
    Stream.fromPull(
      Effect.map(
        Effect.acquireRelease(
          Effect.try({
            try: () => source[Symbol.asyncIterator](),
            catch: (cause) => new JobObserveFailure({ cause }),
          }),
          (iterator) =>
            Effect.promise(async () => {
              try {
                await iterator.return?.();
              } catch {
                /* Keep the primary read error. */
              }
            }),
        ),
        (iterator) =>
          observeJobs(
            "control.observeNext",
            Effect.gen(function* () {
              const next = yield* Effect.acquireUseRelease(
                registerAbort(signal),
                (registration) => {
                  const stopped = registration.failure();
                  if (stopped !== undefined)
                    return Effect.fail(new JobObserveFailure({ cause: stopped }));
                  return Effect.raceAllFirst([
                    Effect.tryPromise({
                      try: () => {
                        if (signal.aborted) return Promise.reject(abortReason(signal));
                        return Promise.resolve(iterator.next());
                      },
                      catch: (cause) => new JobObserveFailure({ cause }),
                    }),
                    Effect.flatMap(Effect.sleep(timeoutMs), () =>
                      Effect.fail(
                        new JobObserveFailure({ cause: new JobObservationTimeoutError(timeoutMs) }),
                      ),
                    ),
                    Effect.flatMap(
                      Effect.promise(() => registration.aborted),
                      (cause) => Effect.fail(new JobObserveFailure({ cause })),
                    ),
                  ]);
                },
                (registration) => Effect.sync(registration.dispose),
              );
              if (next.done) return yield* Cause.done();
              return [next.value] as const;
            }),
          ),
      ),
    ),
  );
}
/** Registers one abort listener, releasing it after each pull. */
function registerAbort(signal: AbortSignal) {
  return Effect.try({
    try: () => {
      let notify!: (cause: unknown) => void;
      const aborted = new Promise<unknown>((resolve) => {
        notify = resolve;
      });
      let stopped: unknown;
      const onAbort = () => {
        stopped = abortReason(signal);
        notify(stopped);
      };
      try {
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      } catch (cause) {
        try {
          signal.removeEventListener("abort", onAbort);
        } catch {
          /* Keep primary failure. */
        }
        throw cause;
      }
      return {
        aborted,
        failure: () => stopped,
        dispose: () => signal.removeEventListener("abort", onAbort),
      };
    },
    catch: (cause) => new JobObserveFailure({ cause }),
  });
}
function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("Observation aborted");
}
