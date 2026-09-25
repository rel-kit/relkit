import { Effect } from "effect";

/**
 * Releases owned resources in order while preserving the first failure.
 * Cleanup continues after a failed release and cannot be interrupted midway.
 *
 * @param operations - Release actions in dependency order.
 * @returns An Effect that succeeds after all actions, or fails with the first error.
 * @example
 * await Effect.runPromise(releaseResourcesEffect([() => stream.close(), () => store.close()]));
 */
export const releaseResourcesEffect = Effect.fn("Observability.releaseResources")(function* (
  operations: readonly (() => void | Promise<unknown>)[],
) {
  return yield* Effect.uninterruptible(
    Effect.gen(function* () {
      let failed = false;
      let firstError: unknown;
      for (const operation of operations) {
        yield* Effect.tryPromise({
          try: () => Promise.resolve().then(operation),
          catch: (error) => error,
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              if (failed) return;
              failed = true;
              firstError = error;
            }),
          ),
        );
      }
      if (failed) return yield* Effect.fail(firstError);
    }),
  );
});

/**
 * Promise compatibility adapter for ordered resource release.
 *
 * @param operations - Release actions in dependency order.
 * @returns Completion after every action, rejecting with the first error.
 * @example
 * await releaseResources([() => stream.close(), () => store.close()]);
 */
export function releaseResources(
  operations: readonly (() => void | Promise<unknown>)[],
): Promise<void> {
  return Effect.runPromise(releaseResourcesEffect(operations));
}
