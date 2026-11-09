/** Holds signal/disconnect listeners until the worker process scope finishes database finalization. */
import { Effect, Exit, Scope } from "effect";
/** @param scope - Physical process owner. @returns Scoped signal/disconnect registrations. */
export const installDuckdbWorkerSignals = Effect.fn("ObservabilityDuckdb.worker.signals")(
  function* (scope: Scope.Closeable) {
    // Terminal and group signals reach the worker alongside its parent; the parent's
    // ordered close (or IPC disconnect when it dies) owns the final flush instead.
    const ignore = (): void => undefined;
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        process.on("SIGINT", ignore);
        process.on("SIGTERM", ignore);
        return ignore;
      }),
      (owned) =>
        Effect.sync(() => {
          process.off("SIGINT", owned);
          process.off("SIGTERM", owned);
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
