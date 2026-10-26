/** Joins the native UI callback before the browser session and server scopes
 * retire. Interruption aborts command execution, then waits for the callback's
 * own failure capture to finish; a cancelled Promise is not assumed completed.
 */
import { Effect } from "effect";

/** Runs one cancellation-aware native UI scenario within joined ownership.
 * @param run - Original UI actions, supplied with their owner's abort signal.
 * @returns Completion or the original native Error, after callback settlement.
 */
export const browserCallback = Effect.fn("InspectorBrowser.scenario")(
  (run: (signal: AbortSignal) => Promise<void>) =>
    Effect.scoped(
      Effect.gen(function* () {
        const owned = yield* Effect.acquireRelease(
          Effect.sync(() => {
            const controller = new AbortController();
            const result = Promise.resolve().then(() => run(controller.signal));
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
        yield* Effect.tryPromise({
          try: () => owned.result,
          catch: (cause) =>
            cause instanceof Error ? cause : new Error("Inspector browser failed", { cause }),
        });
      }),
    ),
);
