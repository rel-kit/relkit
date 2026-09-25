import { Clock, Duration, Effect, Exit, Metric } from "effect";
import type { TelemetryExportQueueOperation } from "./telemetry-export-queue.types.js";

/**
 * Records duration and outcome for one queue operation.
 *
 * @param operation - A static export queue operation label.
 * @param effect - Operation to observe.
 * @returns The original Effect result after metrics are updated.
 * @example
 * Effect.runSync(observeTelemetryExportQueueOperation("stats", Effect.succeed({})));
 */
export function observeTelemetryExportQueueOperation<A, E>(
  operation: TelemetryExportQueueOperation,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const duration = (yield* Clock.currentTimeMillis) - started;
        yield* Metric.update(
          Metric.counter("relkit_observability_export_queue_operations_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_export_queue_duration", {
            attributes: { operation },
          }),
          Duration.millis(duration),
        );
      }),
    );
  });
}
