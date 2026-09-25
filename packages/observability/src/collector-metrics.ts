import { Clock, Duration, Effect, Exit, Metric } from "effect";
import type { CollectorOperation } from "./collector.types.js";

/**
 * Records duration and outcome of a collector operation in Effect telemetry.
 *
 * @param operation - One of the static collector operation labels.
 * @param effect - Operation to observe.
 * @returns The original success or failure after metrics are recorded.
 * @example
 * Effect.runSync(observeCollectorOperation("read", Effect.succeed([])));
 */
export function observeCollectorOperation<A, E>(
  operation: CollectorOperation,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const duration = (yield* Clock.currentTimeMillis) - started;
        yield* Metric.update(
          Metric.counter("relkit_observability_collector_operations_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_collector_duration", { attributes: { operation } }),
          Duration.millis(duration),
        );
      }),
    );
  });
}
