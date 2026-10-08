import { Effect, MutableRef } from "effect";
import { cliPromise, cliTry } from "../cli-errors.js";

/**
 * Owns a cancellable foreign call until its native Promise has settled.
 * @typeParam A - Native successful result.
 * @param operation - Bounded native boundary label.
 * @param run - One foreign call consuming the supplied signal; it must settle after abort.
 * @returns A lazy call that aborts and awaits native settlement on interruption.
 * @remarks Scope cleanup waits for the original call; it never retries a mutation.
 */
export function ownedNativePromise<A>(
  operation: string,
  run: (signal: AbortSignal) => PromiseLike<A>,
) {
  return Effect.scoped(
    Effect.gen(function* () {
      const owned = yield* Effect.acquireRelease(
        cliTry(operation, () => {
          const controller = new AbortController();
          const settled = MutableRef.make(false);
          const promise = Promise.resolve(run(controller.signal)).then(
            (value) => {
              MutableRef.set(settled, true);
              return value;
            },
            (error: unknown) => {
              MutableRef.set(settled, true);
              throw error;
            },
          );
          void promise.catch(() => undefined);
          return { controller, promise, settled };
        }),
        ({ controller, promise, settled }) =>
          Effect.sync(() => {
            if (!MutableRef.get(settled)) controller.abort();
          }).pipe(
            Effect.andThen(
              Effect.promise(() =>
                promise.then(
                  () => undefined,
                  () => undefined,
                ),
              ),
            ),
          ),
      );
      return yield* cliPromise(operation, () => owned.promise);
    }),
  );
}
