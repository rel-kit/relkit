import { Clock, Effect } from "effect";
import { CacheOperationCancelledError, CacheOperationTimeoutError } from "./client-errors.js";
/** Guards provider work with a scoped abort listener and an absolute deadline.
 * @param signal - Caller cancellation signal.
 * @param deadlineMs - Optional deadline in epoch milliseconds.
 * @param work - Provider Effect to run.
 * @returns The work result or a typed cancellation or timeout error.
 * @example Effect.runPromise(runAbortableEffect(new AbortController().signal, undefined, Effect.succeed(1)));
 */
export const runAbortableEffect = Effect.fn("cache.runAbortable")(
  <A, E, R>(signal: AbortSignal, deadlineMs: number | undefined, work: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      if (signal.aborted) return yield* new CacheOperationCancelledError();
      const now = yield* Clock.currentTimeMillis;
      if (deadlineMs !== undefined && deadlineMs <= now)
        return yield* new CacheOperationTimeoutError();
      return yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          let cancel!: (error: CacheOperationCancelledError) => void;
          const cancellation = new Promise<CacheOperationCancelledError>((resolve) => {
            cancel = resolve;
          });
          const onAbort = () => cancel(new CacheOperationCancelledError());
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
            Effect.fail,
          );
          const guarded = Effect.raceFirst(
            Effect.gen(function* () {
              yield* Effect.yieldNow;
              if (signal.aborted) return yield* new CacheOperationCancelledError();
              return yield* work;
            }),
            cancelled,
          );
          return deadlineMs === undefined
            ? guarded
            : Effect.raceFirst(
                guarded,
                Effect.flatMap(Effect.sleep(Math.max(0, deadlineMs - now)), () =>
                  Effect.fail(new CacheOperationTimeoutError()),
                ),
              );
        },
        ({ cleanup }) => Effect.sync(cleanup),
      );
    }),
);
