/** Holds signal/disconnect listeners until the worker process scope finishes database finalization. */
import { Effect, Exit, Scope } from "effect";
/** @param scope - Physical process owner. @returns Scoped signal/disconnect registrations. */
export const installDuckdbWorkerSignals = Effect.fn("ObservabilityDuckdb.worker.signals")(
  function* (scope: Scope.Closeable) {
    const sigint = (): void => undefined;
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        process.on("SIGINT", sigint);
        return sigint;
      }),
      (owned) =>
        Effect.sync(() => {
          process.off("SIGINT", owned);
        }),
    );
    const disconnect = (): void => {
      void Effect.runPromise(Scope.close(scope, Exit.void)).then(
        () => process.exit(),
        () => process.exit(1),
      );
    };
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        process.on("disconnect", disconnect);
        return disconnect;
      }),
      (owned) =>
        Effect.sync(() => {
          process.off("disconnect", owned);
        }),
    );
  },
);
