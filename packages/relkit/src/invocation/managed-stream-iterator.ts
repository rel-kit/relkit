import { Effect, Semaphore } from "effect";
import { observeInvocation } from "./invocation-observability.js";
import { failingManagedIteratorEffect, publicStreamError } from "./managed-stream-failure.js";
import { runStreamPromise, StreamLifecycleFailure, StreamSourceFailure } from "./stream-errors.js";
import type {
  ManagedEffectIterator,
  ManagedStreamIOService,
  ManagedStreamOptions,
} from "./managed-stream.types.js";

/** Opens one managed iterator with a single permit for ordered pulls.
 * @param options - Source and lifecycle callbacks.
 * @param io - Validation and idle scheduling implementation.
 * @param semaphore - One-permit serialization for concurrent next calls.
 * @param state - Shared consumption marker for the iterable.
 * @returns An Effect-capable iterator; no expected construction failure.
 * @example Effect.runSync(createManagedIteratorEffect(options, io, semaphore, { consumed: false }));
 */
export function createManagedIteratorEffect<T>(
  options: ManagedStreamOptions,
  io: ManagedStreamIOService,
  semaphore: Semaphore.Semaphore,
  state: { consumed: boolean },
): Effect.Effect<ManagedEffectIterator<T>> {
  return observeInvocation(
    "stream.managed-open",
    Effect.gen(function* () {
      if (state.consumed) return yield* failingManagedIteratorEffect<T>();
      state.consumed = true;
      return activeIterator<T>(options, io, semaphore);
    }),
  );
}

function activeIterator<T>(
  options: ManagedStreamOptions,
  io: ManagedStreamIOService,
  semaphore: Semaphore.Semaphore,
): ManagedEffectIterator<T> {
  const source = options.source[Symbol.asyncIterator]();
  let settled = false;
  let terminal: StreamLifecycleFailure | StreamSourceFailure | undefined;
  let cancelIdle: (() => void) | undefined;

  const abortSafely = (reason: unknown): Effect.Effect<void> =>
    Effect.sync(() => {
      try {
        options.abort(reason);
      } catch {
        /* An observer failure must not prevent stream cleanup. */
      }
    });

  const finish = (error?: unknown): Effect.Effect<void, StreamSourceFailure> =>
    Effect.suspend(() => {
      if (settled) return Effect.void;
      settled = true;
      cancelIdle?.();
      return Effect.tryPromise({
        try: () => options.settle(error),
        catch: (cause) => new StreamSourceFailure({ cause, message: "Stream settlement failed" }),
      });
    });

  const armIdle = (): void => {
    cancelIdle?.();
    cancelIdle = io.scheduleIdle(options.idleMs, () => {
      const failure = new StreamLifecycleFailure({
        code: "RELKIT_STREAM_CONSUMER_IDLE",
        message: "Stream consumer remained idle after execution started",
      });
      terminal = failure;
      void Effect.runPromise(
        observeInvocation(
          "stream.managed-idle",
          Effect.gen(function* () {
            yield* abortSafely(publicStreamError(failure));
            yield* ignoreFailure(
              Effect.tryPromise({
                try: () => options.run(async () => source.return?.()),
                catch: (cause) =>
                  new StreamSourceFailure({ cause, message: "Stream close failed" }),
              }),
            );
            yield* finish(publicStreamError(failure));
          }),
        ),
      ).catch(() => undefined);
    });
  };

  const cleanup = (
    failure: StreamLifecycleFailure | StreamSourceFailure,
  ): Effect.Effect<never, StreamLifecycleFailure | StreamSourceFailure> =>
    Effect.gen(function* () {
      terminal = failure;
      yield* abortSafely(publicStreamError(failure));
      yield* ignoreFailure(
        Effect.tryPromise({
          try: () => options.run(async () => source.return?.()),
          catch: (cause) => new StreamSourceFailure({ cause, message: "Stream close failed" }),
        }),
      );
      yield* ignoreFailure(finish(publicStreamError(failure)));
      return yield* Effect.fail(failure);
    });

  const nextEffect = (): Effect.Effect<
    IteratorResult<T>,
    StreamLifecycleFailure | StreamSourceFailure
  > =>
    observeInvocation(
      "stream.managed-next",
      semaphore.withPermits(1)(
        Effect.onInterrupt(
          Effect.matchEffect(
            Effect.gen(function* () {
              if (terminal !== undefined) return yield* Effect.fail(terminal);
              if (settled) return { value: undefined as T, done: true };
              cancelIdle?.();
              const result = yield* Effect.tryPromise({
                try: () => options.run(() => source.next()),
                catch: (cause) =>
                  new StreamSourceFailure({ cause, message: "Stream source failed" }),
              });
              if (result.done) {
                yield* finish();
                return { value: undefined as T, done: true };
              }
              const validated = yield* Effect.tryPromise({
                try: () => io.validate(options.schema, result.value),
                catch: (cause) =>
                  new StreamSourceFailure({ cause, message: "Stream validation failed" }),
              });
              if (!("value" in validated))
                return yield* Effect.fail(
                  new StreamLifecycleFailure({
                    code: "RELKIT_STREAM_ITEM_VALIDATION",
                    message: "Stream item validation failed",
                  }),
                );
              const value = validated.value as T;
              const bytes = yield* Effect.try({
                try: () => encodedBytes(value),
                catch: () =>
                  new StreamLifecycleFailure({
                    code: "RELKIT_STREAM_ITEM_ENCODING",
                    message: "Stream item is not JSON encodable",
                  }),
              });
              if (bytes > options.maxItemBytes)
                return yield* Effect.fail(
                  new StreamLifecycleFailure({
                    code: "RELKIT_STREAM_ITEM_TOO_LARGE",
                    message: "Encoded stream item exceeds the configured limit",
                  }),
                );
              armIdle();
              return { value, done: false };
            }),
            { onFailure: cleanup, onSuccess: Effect.succeed },
          ),
          () =>
            Effect.asVoid(
              Effect.exit(
                cleanup(
                  new StreamSourceFailure({
                    cause: new DOMException("Stream pull interrupted", "AbortError"),
                    message: "Stream pull interrupted",
                  }),
                ),
              ),
            ),
        ),
      ),
    );

  const returnEffect = (value?: unknown): Effect.Effect<IteratorResult<T>, StreamSourceFailure> =>
    observeInvocation(
      "stream.managed-return",
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          yield* abortSafely(new DOMException("Stream consumer cancelled", "AbortError"));
          const result = yield* Effect.matchEffect(
            Effect.tryPromise({
              try: () => options.run(async () => source.return?.(value)),
              catch: (cause) => new StreamSourceFailure({ cause, message: "Stream return failed" }),
            }),
            {
              onFailure: (failure) =>
                Effect.flatMap(ignoreFailure(finish(failure)), () => Effect.fail(failure)),
              onSuccess: () => Effect.as(finish(), { value: value as T, done: true as const }),
            },
          );
          return result;
        }),
      ),
    );

  armIdle();
  return {
    nextEffect,
    next: () => runStreamPromise(nextEffect()),
    return: (value?: unknown) => runStreamPromise(returnEffect(value)),
  };
}

function encodedBytes(value: unknown): number {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError("Stream item is not JSON encodable");
  return new TextEncoder().encode(encoded).byteLength;
}

function ignoreFailure<A, E>(effect: Effect.Effect<A, E>): Effect.Effect<void> {
  return Effect.matchEffect(effect, { onFailure: () => Effect.void, onSuccess: () => Effect.void });
}
