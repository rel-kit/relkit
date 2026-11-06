import { Clock, Duration, Effect, Exit, Metric } from "effect";
/**
 * Records bounded operation, duration, and failure measurements for direct export.
 *
 * @param operation - Static direct-export operation label.
 * @param effect - Effect to observe.
 * @returns The original Effect success or failure.
 * @example
 * yield* observeDirectExport("flush", queue.flush());
 */
export function observeDirectExport<A, E, R>(
  operation: "create" | "enqueue" | "flush" | "close" | "shutdown",
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const duration = (yield* Clock.currentTimeMillis) - started;
        yield* Metric.update(
          Metric.counter("relkit_observability_direct_export_operations_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_direct_export_duration", {
            attributes: { operation },
          }),
          Duration.millis(duration),
        );
      }),
    );
  });
}
