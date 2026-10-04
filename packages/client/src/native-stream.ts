import { Effect, Exit, Stream } from "effect";
import { observeExecutionStream } from "@relkit/contracts/operation";

/**
 * Suspends native work and passes the owning fiber's cancellation signal.
 * @typeParam A - Native successful value.
 * @param execute - Cancellation-aware native operation.
 * @returns Lazy work retaining any original thrown or rejected value.
 */
export function nativeCall<A>(
  execute: (signal: AbortSignal) => PromiseLike<A>,
): Effect.Effect<A, unknown> {
  return Effect.tryPromise({ try: execute, catch: (cause) => cause });
}

/**
 * Owns an iterator and its request through all pulls, EOF and early return.
 * @typeParam A - Native stream element.
 * @param operation - Fixed declaration-owned lifetime label.
 * @param open - Opens the iterator with the stream's request signal.
 * @param caller - Optional borrowed cancellation signal.
 * @param opened - Optional state transition after acquisition and before the first pull.
 * @param read - Optional bounded native read, sharing the request's cancellation signal.
 * @returns A lazy observed stream; interruption aborts before awaiting native return.
 * @remarks Each consumer owns a distinct Scope. Native APIs must respect the supplied
 * signal; iterator return alone cannot release a pending native pull.
 */
export function nativeStream<A>(
  operation: string,
  open: (signal: AbortSignal) => PromiseLike<AsyncIterator<A>>,
  caller?: AbortSignal,
  opened: Effect.Effect<void> = Effect.void,
  read: (iterator: AsyncIterator<A>, signal: AbortSignal) => PromiseLike<IteratorResult<A>> = (
    iterator,
  ) => iterator.next(),
): Stream.Stream<A, unknown> {
  const source = Stream.unwrap(
    Effect.gen(function* () {
      const controller = new AbortController();
      const signal =
        caller === undefined ? controller.signal : AbortSignal.any([caller, controller.signal]);
      let closing: PromiseLike<IteratorResult<A>> | undefined;
      const close = (iterator: AsyncIterator<A>): PromiseLike<IteratorResult<A>> => {
        controller.abort();
        return (closing ??= Promise.resolve().then(
          () => iterator.return?.() ?? { done: true as const, value: undefined },
        ));
      };
      const iterator = yield* Effect.acquireRelease(
        nativeCall(() =>
          Promise.resolve(open(signal)).then(async (iterator) => {
            // A native API that resolves after cancellation still owes cleanup.
            if (controller.signal.aborted) await close(iterator);
            return iterator;
          }),
        ).pipe(
          Effect.onExit((exit) =>
            Effect.sync(() => {
              if (Exit.isFailure(exit)) controller.abort();
            }),
          ),
        ),
        (iterator) =>
          Effect.gen(function* () {
            yield* nativeCall(() => close(iterator)).pipe(Effect.catchCause(() => Effect.void));
          }),
        { interruptible: true },
      );
      yield* opened;
      return observeExecutionStream(
        "client",
        operation,
        Stream.unfold(iterator, (iterator) =>
          nativeCall(() => read(iterator, signal)).pipe(
            Effect.map((next) => (next.done ? undefined : ([next.value, iterator] as const))),
            Effect.onInterrupt(() => Effect.sync(() => controller.abort())),
          ),
        ),
      );
    }),
  );
  return source;
}
