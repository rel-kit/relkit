import { Clock, Duration, Effect, Exit, Metric } from "effect";

/**
 * Records one local batch queue operation with bounded labels.
 *
 * @param operation - Stable operation name.
 * @param effect - Work to observe.
 * @returns The original Effect success or failure.
 * @example
 * Effect.runSync(observeLocalBatchQueue("stats", Effect.succeed({})));
 */
export function observeLocalBatchQueue<A, E>(
  operation: "create" | "enqueue" | "flush" | "close" | "stats",
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const duration = (yield* Clock.currentTimeMillis) - started;
        yield* Metric.update(
          Metric.counter("relkit_observability_local_batch_operations_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_local_batch_duration", {
            attributes: { operation },
          }),
          Duration.millis(duration),
        );
      }),
    );
  });
}
