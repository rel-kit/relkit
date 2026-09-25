import { Clock, Duration, Effect, Exit, Metric, Schema } from "effect";
import type { ObservabilityRecord, ObservabilitySignal } from "../model.js";
import { segmentStoreUtilsCore } from "./segment-store-utils-core.js";
/**
 * Tagged invalid bound or timestamp for a segment utility.
 * @example
 * if (error._tag === "SegmentUtilityError") console.error(error.operation);
 */
export class SegmentUtilityError extends Schema.TaggedError<SegmentUtilityError>()(
  "SegmentUtilityError",
  { operation: Schema.Literals(["positive", "dayFor"]), message: Schema.String },
) {}
function observe<A>(operation: string, effect: Effect.Effect<A, SegmentUtilityError>) {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_segment_utility_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_segment_utility_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
/**
 * Validates a positive segment bound in an observed Effect.
 * @param value - Candidate bound.
 * @returns An Effect with the bound or a tagged validation error.
 * @example
 * const size = Effect.runSync(positiveSegmentBoundEffect(1024));
 */
export const positiveSegmentBoundEffect = Effect.fn("ObservabilitySegments.positive")(
  (value: number) =>
    observe(
      "positive",
      Effect.try({
        try: () => segmentStoreUtilsCore.positive(value),
        catch: (cause) =>
          new SegmentUtilityError({
            operation: "positive",
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
    ),
);
/**
 * Checks signal and version fields in an observed Effect.
 * @param value - Candidate record.
 * @param signal - Required signal.
 * @returns An Effect with the discriminator result.
 * @example
 * const valid = Effect.runSync(isRecordForSignalEffect(value, "log"));
 */
export const isRecordForSignalEffect = Effect.fn("ObservabilitySegments.isRecordForSignal")(
  (value: unknown, signal: ObservabilitySignal) =>
    observe(
      "isRecordForSignal",
      Effect.sync(() => segmentStoreUtilsCore.isRecordForSignal(value, signal)),
    ),
);
/**
 * Parses a record's UTC calendar day in an observed Effect.
 * @param record - Model record with a time field.
 * @returns An Effect with the day or a tagged timestamp error.
 * @example
 * const day = Effect.runSync(dayForEffect(record));
 */
export const dayForEffect = Effect.fn("ObservabilitySegments.dayFor")(
  (record: ObservabilityRecord) =>
    observe(
      "dayFor",
      Effect.try({
        try: () => segmentStoreUtilsCore.dayFor(record),
        catch: (cause) =>
          new SegmentUtilityError({
            operation: "dayFor",
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
    ),
);
