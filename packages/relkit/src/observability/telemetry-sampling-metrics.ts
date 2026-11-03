import { Clock, Duration, Effect, Exit, Metric } from "effect";
import type { SamplingOperation } from "./telemetry-sampling.types.js";

/**
 * Records one deterministic sampling operation's duration and outcome.
 *
 * @param operation - A static sampling operation label.
 * @param effect - Operation to observe.
 * @returns The original Effect result after metrics are updated.
 * @example
 * Effect.runSync(observeSamplingOperation("traceIsSampled", Effect.succeed(true)));
 */
export function observeSamplingOperation<A, E>(
  operation: SamplingOperation,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const duration = (yield* Clock.currentTimeMillis) - started;
        yield* Metric.update(
          Metric.counter("relkit_observability_sampling_operations_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_sampling_duration", { attributes: { operation } }),
          Duration.millis(duration),
        );
      }),
    );
  });
}
