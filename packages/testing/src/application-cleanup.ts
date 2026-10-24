/** Finalizers preserve sibling release and report every application cleanup failure. */
import { Effect } from "effect";

/** Collects release failures and retains them in the Cause when acquisition already failed. */
export function cleanup(
  release: () => Promise<unknown> | undefined,
  failures: unknown[],
  failed = false,
): Effect.Effect<void> {
  return Effect.tryPromise({
    try: async () => {
      await release();
    },
    catch: (cause) => cause,
  }).pipe(
    Effect.catch((cause) =>
      Effect.sync(() => {
        failures.push(cause);
      }).pipe(Effect.flatMap(() => (failed ? Effect.die(cause) : Effect.void))),
    ),
  );
}
