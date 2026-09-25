import { Clock, Duration, Effect, Exit, Metric } from "effect";
import type { RequestRecordOperation } from "./request-record.types.js";
/**
 * Measures one request builder operation with bounded labels.
 *
 * @param operation - Static request operation name.
 * @param effect - Work to measure.
 * @returns The original Effect success or failure.
 * @example
 * yield* observeRequestRecord("finish", builder.finish({ status: 200 }));
 */
export function observeRequestRecord<A, E, R>(
  operation: RequestRecordOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const duration = (yield* Clock.currentTimeMillis) - started;
        yield* Metric.update(
          Metric.counter("relkit_observability_request_record_operations_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_request_record_duration", {
            attributes: { operation },
          }),
          Duration.millis(duration),
        );
      }),
    );
  });
}
