import { Clock, Effect, Schema } from "effect";
import {
  EventClientValidationError,
  EventDependencyError,
  EventOperationCancelledError,
  EventOperationTimeoutError,
  EventPayloadValidationFailure,
} from "./client-errors.js";
import { observeEvent } from "./event-observability.js";

/** Typed failure returned by the work callback.
 * @example new EventWorkFailed({ cause: new Error("Provider failed") })
 */
export class EventWorkFailed extends Schema.TaggedError<EventWorkFailed>()("EventWorkFailed", {
  cause: Schema.Defect(),
}) {}

/** Runs callback work with an owned abort listener and deadline timer.
 * @param signal - External cancellation signal.
 * @param deadlineMs - Absolute deadline in milliseconds, if any.
 * @param work - Promise-returning provider operation, given an interruption signal.
 * @returns An Effect succeeding with the result or failing with a tagged cancellation, timeout, or work failure.
 * @example Effect.runPromise(runAbortableEffect(new AbortController().signal, undefined, async () => 1))
 */
export const runAbortableEffect = Effect.fn("Events.runAbortable")(
  <A>(
    signal: AbortSignal,
    deadlineMs: number | undefined,
    work: (effectSignal: AbortSignal) => Promise<A>,
  ): Effect.Effect<
    A,
    | EventClientValidationError
    | EventDependencyError
    | EventOperationCancelledError
    | EventOperationTimeoutError
    | EventPayloadValidationFailure
    | EventWorkFailed
  > =>
    observeEvent(
      "client.runAbortable",
      Effect.gen(function* () {
        if (signal.aborted) return yield* new EventOperationCancelledError();
        const now = yield* Clock.currentTimeMillis;
        if (deadlineMs !== undefined && deadlineMs <= now)
          return yield* new EventOperationTimeoutError();
        return yield* Effect.acquireUseRelease(
          Effect.try({
            try: () => {
              let cancel: (reason: EventOperationCancelledError) => void = () => {};
              const cancelled = new Promise<EventOperationCancelledError>((resolve) => {
                cancel = resolve;
              });
              const onAbort = () => cancel(new EventOperationCancelledError());
              try {
                signal.addEventListener("abort", onAbort, { once: true });
              } catch (cause) {
                signal.removeEventListener("abort", onAbort);
                throw cause;
              }
              if (signal.aborted) onAbort();
              return {
                cancelled,
                release: () => signal.removeEventListener("abort", onAbort),
              };
            },
            catch: (cause) => new EventWorkFailed({ cause }),
          }),
          ({ cancelled }) => {
            const active = Effect.tryPromise({
              try: (effectSignal) =>
                Promise.resolve().then(() => {
                  if (signal.aborted || effectSignal.aborted)
                    throw new EventOperationCancelledError();
                  return work(effectSignal);
                }),
              catch: (cause) =>
                cause instanceof EventOperationCancelledError ||
                cause instanceof EventOperationTimeoutError ||
                cause instanceof EventClientValidationError ||
                cause instanceof EventDependencyError ||
                cause instanceof EventPayloadValidationFailure ||
                cause instanceof EventWorkFailed
                  ? cause
                  : new EventWorkFailed({ cause }),
            });
            const guarded = Effect.raceFirst(
              active,
              Effect.flatMap(
                Effect.promise(() => cancelled),
                Effect.fail,
              ),
            );
            return deadlineMs === undefined
              ? guarded
              : Effect.raceFirst(
                  guarded,
                  Effect.flatMap(Effect.sleep(Math.max(0, deadlineMs - now)), () =>
                    Effect.fail(new EventOperationTimeoutError()),
                  ),
                );
          },
          ({ release }) => Effect.sync(release),
        );
      }),
    ),
);

/** Promise compatibility adapter for abortable event work.
 * @param signal - External cancellation signal.
 * @param deadlineMs - Absolute deadline in milliseconds, if any.
 * @param work - Promise-returning provider operation.
 * @returns A Promise for the work result.
 * @throws The established cancellation, timeout, or provider error.
 * @example await runAbortable(new AbortController().signal, undefined, async () => 1)
 */
export async function runAbortable<A>(
  signal: AbortSignal,
  deadlineMs: number | undefined,
  work: () => Promise<A>,
): Promise<A> {
  return Effect.runPromise(runAbortableEffect(signal, deadlineMs, work)).catch((error: unknown) => {
    if (error instanceof EventWorkFailed) throw error.cause;
    throw error;
  });
}
