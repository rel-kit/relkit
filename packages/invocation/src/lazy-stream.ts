import { Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import { runStreamPromise, StreamLifecycleFailure, StreamSourceFailure } from "./stream-errors.js";
import type { LazyEffectIterator, LazyEffectStream } from "./lazy-stream.types.js";

export type { LazyEffectIterator, LazyEffectStream } from "./lazy-stream.types.js";

/** Creates a single-consumer stream through Effect without starting its source.
 * @param start - Opens the source on first demand.
 * @returns A lazy iterable whose iterator exposes Effect operations.
 * @example Effect.runSync(lazySingleConsumerStreamEffect(async () => source));
 */
export function lazySingleConsumerStreamEffect<T>(
  start: () => Promise<AsyncIterable<T>>,
): Effect.Effect<LazyEffectStream<T>> {
  return observeInvocation(
    "stream.lazy-create",
    Effect.sync(() => {
      let consumed = false;
      return Object.freeze({
        [Symbol.asyncIterator](): LazyEffectIterator<T> {
          if (consumed) return failingIterator();
          consumed = true;
          let source: Promise<AsyncIterator<T>> | undefined;
          const get = (): Promise<AsyncIterator<T>> => {
            source ??= Promise.resolve().then(async () => (await start())[Symbol.asyncIterator]());
            return source;
          };
          const nextEffect = (): Effect.Effect<IteratorResult<T>, StreamSourceFailure> =>
            observeInvocation(
              "stream.lazy-next",
              Effect.tryPromise({
                try: async () => (await get()).next(),
                catch: (cause) => new StreamSourceFailure({ cause, message: "Stream source failed" }),
              }),
            );
          const returnEffect = (value?: unknown): Effect.Effect<IteratorResult<T>, StreamSourceFailure> =>
            observeInvocation(
              "stream.lazy-return",
              Effect.tryPromise({
                try: async () => {
                  if (source === undefined) return { value: value as T, done: true };
                  const iterator = await source;
                  return iterator.return?.(value) ?? { value: value as T, done: true };
                },
                catch: (cause) => new StreamSourceFailure({ cause, message: "Stream return failed" }),
              }),
            );
          const throwEffect = (error?: unknown): Effect.Effect<IteratorResult<T>, StreamSourceFailure> =>
            observeInvocation(
              "stream.lazy-throw",
              Effect.tryPromise({
                try: async () => {
                  const iterator = await get();
                  if (iterator.throw) return iterator.throw(error);
                  throw error;
                },
                catch: (cause) => new StreamSourceFailure({ cause, message: "Stream throw failed" }),
              }),
            );
          return {
            nextEffect,
            returnEffect,
            throwEffect,
            next: () => runStreamPromise(nextEffect()),
            return: (value?: unknown) => runStreamPromise(returnEffect(value)),
            throw: (error?: unknown) => runStreamPromise(throwEffect(error)),
          };
        },
      });
    }),
  );
}

/** Public lazy single-consumer stream compatibility adapter.
 * @param start - Opens the source on first demand.
 * @returns A lazy async iterable.
 * @example lazySingleConsumerStream(async () => source);
 */
export function lazySingleConsumerStream<T>(start: () => Promise<AsyncIterable<T>>): AsyncIterable<T> {
  return runInvocationSync(lazySingleConsumerStreamEffect(start));
}

function failingIterator<T>(): LazyEffectIterator<T> {
  const failureEffect = (
    operation: "stream.lazy-next" | "stream.lazy-return" | "stream.lazy-throw",
  ): Effect.Effect<IteratorResult<T>, StreamLifecycleFailure> =>
    observeInvocation(
      operation,
      Effect.fail(
        new StreamLifecycleFailure({
          code: "RELKIT_STREAM_ALREADY_CONSUMED",
          message: "A Relkit stream can be consumed only once",
        }),
      ),
    );
  const nextEffect = () => failureEffect("stream.lazy-next");
  const returnEffect = () => failureEffect("stream.lazy-return");
  const throwEffect = () => failureEffect("stream.lazy-throw");
  return {
    nextEffect, returnEffect, throwEffect,
    next: () => runStreamPromise(nextEffect()),
    return: () => runStreamPromise(returnEffect()),
    throw: () => runStreamPromise(throwEffect()),
  };
}
