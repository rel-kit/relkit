import { Clock, Effect } from "effect";
import { BucketOperationCancelledError, BucketOperationTimeoutError } from "./client-errors.js";

/** Runs provider work with a scoped abort listener and deadline.
 * @param signal - Caller cancellation signal.
 * @param deadlineMs - Optional absolute deadline in milliseconds.
 * @param work - Effect whose provider signal is interrupted on cancellation.
 * @returns Work result or a tagged cancellation or timeout error.
 * @example Effect.runPromise(runAbortableEffect(new AbortController().signal, undefined, Effect.succeed(1)));
 */
export const runAbortableEffect = Effect.fn("bucket.runAbortable")(
  <A, E, R>(
    signal: AbortSignal,
    deadlineMs: number | undefined,
    work: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | BucketOperationCancelledError | BucketOperationTimeoutError, R> =>
    Effect.gen(function* () {
      if (signal.aborted) return yield* new BucketOperationCancelledError();
      const now = yield* Clock.currentTimeMillis;
      if (deadlineMs !== undefined && deadlineMs <= now)
        return yield* new BucketOperationTimeoutError();
      return yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          let cancel!: (error: BucketOperationCancelledError) => void;
          const cancellation = new Promise<BucketOperationCancelledError>((resolve) => {
            cancel = resolve;
          });
          const onAbort = () => cancel(new BucketOperationCancelledError());
          try {
            signal.addEventListener("abort", onAbort, { once: true });
            if (signal.aborted) onAbort();
          } catch (cause) {
            signal.removeEventListener("abort", onAbort);
            throw cause;
          }
          return { cancellation, cleanup: () => signal.removeEventListener("abort", onAbort) };
        }),
        ({ cancellation }) => {
          const cancelled = Effect.flatMap(
            Effect.promise(() => cancellation),
            (error) => Effect.fail(error),
          );
          const guarded = Effect.raceFirst(
            Effect.gen(function* () {
              yield* Effect.yieldNow;
              if (signal.aborted) return yield* new BucketOperationCancelledError();
              return yield* work;
            }),
            cancelled,
          );
          return deadlineMs === undefined
            ? guarded
            : Effect.raceFirst(
                guarded,
                Effect.flatMap(Effect.sleep(Math.max(0, deadlineMs - now)), () =>
                  Effect.fail(new BucketOperationTimeoutError()),
                ),
              );
        },
        ({ cleanup }) => Effect.sync(cleanup),
      );
    }),
);
