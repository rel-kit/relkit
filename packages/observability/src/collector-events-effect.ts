import { Clock, Duration, Effect, Exit, Metric } from "effect";
import { collectorEventsCore as core } from "./collector-events-core.js";
/**
 * Converts one supported runtime event into a versioned observability record.
 * Unknown event shapes return undefined; malformed getters can defect.
 * @param value - Candidate runtime event.
 * @returns An Effect with a model record or undefined.
 * @example
 * const record = Effect.runSync(toObservabilityRecordEffect(event));
 */
export const toObservabilityRecordEffect = Effect.fn("ObservabilityCollector.toRecord")(
  (value: unknown) =>
    Effect.gen(function* () {
      const started = yield* Clock.currentTimeMillis;
      return yield* Effect.onExit(
        Effect.sync(() => core.toObservabilityRecord(value)),
        (exit) =>
          Effect.gen(function* () {
            yield* Metric.update(
              Metric.counter("relkit_observability_collector_events_total", {
                attributes: {
                  operation: "toRecord",
                  outcome: Exit.isSuccess(exit) ? "success" : "failure",
                },
              }),
              1,
            );
            yield* Metric.update(
              Metric.timer("relkit_observability_collector_events_duration", {
                attributes: { operation: "toRecord" },
              }),
              Duration.millis((yield* Clock.currentTimeMillis) - started),
            );
          }),
      );
    }),
);
