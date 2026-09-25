import { Clock, Duration, Effect, Exit, Metric } from "effect";
import type { RecordLike } from "./collector-values.types.js";
import { collectorRecordsCore as core } from "./collector-records-core.js";
function observe<A>(
  operation: "invocation" | "span" | "log",
  effect: Effect.Effect<A>,
): Effect.Effect<A> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_collector_records_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_collector_records_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
/**
 * Converts legacy invocation fields into a versioned model record.
 * @param value - Candidate invocation fields.
 * @returns An Effect with a record or undefined when identity fields are missing.
 * @example
 * const record = Effect.runSync(invocationRecordEffect(value));
 */
export const invocationRecordEffect = Effect.fn("ObservabilityCollector.invocationRecord")(
  (value: RecordLike) =>
    observe(
      "invocation",
      Effect.sync(() => core.invocationRecord(value)),
    ),
);
/**
 * Converts span lifecycle fields into a versioned model record.
 * @param value - Candidate span fields.
 * @returns An Effect with a record or undefined when identity fields are missing.
 * @example
 * const record = Effect.runSync(spanRecordEffect(value));
 */
export const spanRecordEffect = Effect.fn("ObservabilityCollector.spanRecord")(
  (value: RecordLike) =>
    observe(
      "span",
      Effect.sync(() => core.spanRecord(value)),
    ),
);
/**
 * Converts runtime log fields into a versioned model record.
 * @param value - Candidate log fields.
 * @returns An Effect with a record or undefined when required fields are missing.
 * @example
 * const record = Effect.runSync(logRecordEffect(value));
 */
export const logRecordEffect = Effect.fn("ObservabilityCollector.logRecord")((value: RecordLike) =>
  observe(
    "log",
    Effect.sync(() => core.logRecord(value)),
  ),
);
