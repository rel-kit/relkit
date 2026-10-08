import { Effect } from "effect";
import { cliPromise } from "./cli-errors.js";
import { observeCli } from "./cli-runtime.js";

/**
 * Retains physical completion when a native Promise calls back into this owner.
 * @typeParam A - Public callback result.
 * @param operation - Fixed native boundary label.
 * @param action - Cancellation-aware foreign callback.
 * @param borrowed - Optional caller signal retaining its original cancellation reason.
 * @returns The callback result; owner release first aborts and then awaits settlement.
 */
export function contributorCallback<A>(
  operation: string,
  action: (signal: AbortSignal) => PromiseLike<A>,
  borrowed?: AbortSignal,
) {
  return observeCli(
    "contributor.callback",
    Effect.scoped(
      Effect.gen(function* () {
        const owned = yield* Effect.acquireRelease(
          Effect.sync(() => {
            const controller = new AbortController();
            const signal =
              borrowed === undefined
                ? controller.signal
                : AbortSignal.any([borrowed, controller.signal]);
            const result = Promise.resolve().then(() => action(signal));
            return {
              controller,
              result,
              settled: result.then(
                () => undefined,
                () => undefined,
              ),
            };
          }),
          (owned) =>
            Effect.sync(() => owned.controller.abort()).pipe(
              Effect.andThen(Effect.promise(() => owned.settled)),
            ),
        );
        return yield* cliPromise(operation, () => owned.result);
      }),
    ),
  );
}
