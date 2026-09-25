import { Clock, Duration, Effect, Exit, Metric } from "effect";
import type { RecordLike } from "./collector-values.types.js";
import { collectorValuesCore as core } from "./collector-values-core.js";
function observe<A>(operation: string, effect: Effect.Effect<A>): Effect.Effect<A> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_collector_values_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_collector_values_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
/**
 * Checks whether a record has a supported model signal and version.
 * @param value - Candidate record.
 * @returns An Effect with the model check result.
 * @example
 * const valid = Effect.runSync(isModelRecordEffect(value));
 */
export const isModelRecordEffect = Effect.fn("ObservabilityCollector.isModelRecord")(
  (value: RecordLike) =>
    observe(
      "isModelRecord",
      Effect.sync(() => core.isModelRecord(value)),
    ),
);
/**
 * Checks whether a legacy event has invocation identity fields.
 * @param value - Candidate record.
 * @returns An Effect with the invocation check result.
 * @example
 * const valid = Effect.runSync(isInvocationEffect(value));
 */
export const isInvocationEffect = Effect.fn("ObservabilityCollector.isInvocation")(
  (value: RecordLike) =>
    observe(
      "isInvocation",
      Effect.sync(() => core.isInvocation(value)),
    ),
);
/**
 * Checks whether a legacy event has runtime log fields.
 * @param value - Candidate record.
 * @returns An Effect with the log check result.
 * @example
 * const valid = Effect.runSync(isRuntimeLogEffect(value));
 */
export const isRuntimeLogEffect = Effect.fn("ObservabilityCollector.isRuntimeLog")(
  (value: RecordLike) =>
    observe(
      "isRuntimeLog",
      Effect.sync(() => core.isRuntimeLog(value)),
    ),
);
/**
 * Returns a nonempty text value when present.
 * @param value - Candidate text.
 * @returns An Effect with nonempty text or undefined.
 * @example
 * const name = Effect.runSync(collectorTextEffect("orders"));
 */
export const collectorTextEffect = Effect.fn("ObservabilityCollector.text")((value: unknown) =>
  observe(
    "text",
    Effect.sync(() => core.text(value)),
  ),
);
/**
 * Checks whether a value is a non-array object record.
 * @param value - Candidate value.
 * @returns An Effect with the record check result.
 * @example
 * const valid = Effect.runSync(isCollectorRecordEffect({}));
 */
export const isCollectorRecordEffect = Effect.fn("ObservabilityCollector.isRecord")(
  (value: unknown) =>
    observe(
      "isRecord",
      Effect.sync(() => core.isRecord(value)),
    ),
);
