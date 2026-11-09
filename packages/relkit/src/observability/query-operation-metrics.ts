import { Clock, Duration, Effect, Exit, Metric } from "effect";
/**
 * Records bounded operation and duration metrics for a public query operation.
 * @param operation - Static query operation label.
 * @param effect - Query operation to observe.
 * @returns The original success or failure after metrics are recorded.
 * @example
 * const observed = observeQueryOperation("logs", Effect.succeed(page));
 */
export function observeQueryOperation<A, E, R>(
  operation: "create" | "requests" | "logs" | "traces" | "request" | "log" | "trace",
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_query_operations_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_query_operation_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
