import { Clock, Effect, Result, Schema } from "effect";
import { JobOperationCancelledError, JobOperationTimeoutError } from "./client-errors.js";
import type { JobClientAbortRegistration } from "./client-abort.types.js";
import { observeJobs } from "./jobs-observability.js";
/** Cancelled, timed out, or failed client enqueue, with the original cause.
 * @example if (error instanceof JobClientAbortFailure) console.log(error.message);
 */
export class JobClientAbortFailure extends Schema.TaggedError<JobClientAbortFailure>()(
  "Jobs.ClientAbortFailure",
  { cause: Schema.Defect() },
) {}
/** Runs client work with an Effect owned abort listener and deadline.
 * @param signal - Caller cancellation signal.
 * @param deadlineMs - Optional absolute deadline in epoch milliseconds.
 * @param work - Provider work that receives the owned cancellation signal.
 * @returns Provider result or JobClientAbortFailure.
 * @example Effect.runPromise(runAbortableEffect(signal, undefined, () => Promise.resolve("ok")));
 */
export const runAbortableEffect = Effect.fn("Jobs.runClientAbortable")(
  function* <A>(
    signal: AbortSignal,
    deadlineMs: number | undefined,
    work: (signal: AbortSignal) => Promise<A>,
  ) {
    if (signal.aborted)
      return yield* new JobClientAbortFailure({ cause: new JobOperationCancelledError() });
    return yield* Effect.acquireUseRelease(
      register(signal),
      (registration) =>
        Effect.gen(function* () {
          const initial = registration.failure();
          if (initial !== undefined) return yield* new JobClientAbortFailure({ cause: initial });
          const now = yield* Clock.currentTimeMillis;
          if (deadlineMs !== undefined && deadlineMs <= now)
            return yield* new JobClientAbortFailure({ cause: new JobOperationTimeoutError() });
          const pending = Effect.tryPromise({
            try: (effectSignal) => {
              const providerSignal = AbortSignal.any([signal, effectSignal]);
              const pending = Promise.resolve().then(() => {
                const stopped = registration.failure();
                if (stopped !== undefined) throw stopped;
                if (providerSignal.aborted) throw new JobOperationCancelledError();
                return work(providerSignal);
              });
              const stopped = registration.stopped.then((cause) => {
                throw cause;
              });
              return Promise.race([pending, stopped]);
            },
            catch: (cause) => new JobClientAbortFailure({ cause }),
          });
          const bounded =
            deadlineMs === undefined
              ? pending
              : Effect.timeoutOrElse(pending, {
                  duration: Math.max(0, deadlineMs - now),
                  orElse: () =>
                    Effect.fail(
                      new JobClientAbortFailure({ cause: new JobOperationTimeoutError() }),
                    ),
                });
          return yield* bounded;
        }),
      (registration) => Effect.sync(registration.dispose),
    );
  },
  (effect) => observeJobs("client.runAbortable", effect),
);
/** Promise compatibility adapter for abortable client work.
 * @param signal - Caller cancellation signal.
 * @param deadlineMs - Optional absolute deadline.
 * @param work - Provider work that receives the owned cancellation signal.
 * @returns Provider result.
 * @throws The original cancellation, timeout, or provider error.
 * @example await runAbortable(signal, undefined, () => Promise.resolve("ok"));
 */
export async function runAbortable<A>(
  signal: AbortSignal,
  deadlineMs: number | undefined,
  work: (signal: AbortSignal) => Promise<A>,
): Promise<A> {
  const result = await Effect.runPromise(
    Effect.result(runAbortableEffect(signal, deadlineMs, work)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Acquires a listener, cleaning partial registration failures. */
function register(
  signal: AbortSignal,
): Effect.Effect<JobClientAbortRegistration, JobClientAbortFailure> {
  return Effect.try({
    try: () => {
      let stopped: Error | undefined;
      let notify: (cause: Error) => void = () => undefined;
      const stoppedPromise = new Promise<Error>((resolve) => {
        notify = resolve;
      });
      const stop = (cause: Error): void => {
        if (stopped !== undefined) return;
        stopped = cause;
        notify(cause);
      };
      const onAbort = (): void => stop(new JobOperationCancelledError());
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
        stopped: stoppedPromise,
        failure: () => stopped,
        dispose: () => {
          signal.removeEventListener("abort", onAbort);
        },
      };
    },
    catch: (cause) => new JobClientAbortFailure({ cause }),
  });
}
