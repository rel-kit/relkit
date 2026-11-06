import { Clock, Duration, Effect, Exit, Metric, Schema } from "effect";
import type { RedactedObservabilityRecord } from "./record-admission.js";
import type { TelemetryExporterDescriptor } from "./telemetry-config.js";
import type { TelemetryExporterFailure } from "./telemetry-exporter.types.js";
import type { Lane } from "./telemetry-exporter-lane.types.js";
import { telemetryLaneCore } from "./telemetry-exporter-lane-core.js";
import { telemetryExporterFactory } from "./telemetry-exporter-resolution.js";
import type { TelemetryExportDecision } from "./telemetry-sampling.js";
import type { TelemetryExporterFanoutOptions } from "./telemetry-exporters.types.js";
/**
 * Tagged unexpected exporter lane operation failure.
 * @example
 * if (error._tag === "TelemetryLaneError") console.error(error.operation);
 */
export class TelemetryLaneError extends Schema.TaggedError<TelemetryLaneError>()(
  "TelemetryLaneError",
  { operation: Schema.String, message: Schema.String, cause: Schema.Unknown },
) {}
function failure(operation: string, cause: unknown): TelemetryLaneError {
  return new TelemetryLaneError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
function observe<A>(operation: string, effect: Effect.Effect<A, TelemetryLaneError>) {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_telemetry_lane_operations_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_telemetry_lane_operation_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
/**
 * Opens a lane with an abort signal forwarded into its runtime factory.
 * @param name - Stable lane name.
 * @param descriptor - Exporter identity and configuration.
 * @param factory - Validated runtime factory.
 * @param options - Runtime values and external cancellation signal.
 * @param report - Bounded failure sink.
 * @returns An Effect with an initialized or failed lane, or tagged unexpected error.
 * @example
 * const lane = await Effect.runPromise(createLaneEffect("logs", descriptor, factory, options, report));
 */
export const createLaneEffect = Effect.fn("TelemetryLane.create")(
  (
    name: string,
    descriptor: TelemetryExporterDescriptor,
    factory: ReturnType<typeof telemetryExporterFactory>,
    options: TelemetryExporterFanoutOptions,
    report: (failure: TelemetryExporterFailure) => void,
  ) =>
    observe(
      "create",
      Effect.tryPromise({
        try: (signal) =>
          telemetryLaneCore.createLane(
            name,
            descriptor,
            factory,
            {
              ...options,
              signal:
                options.signal === undefined ? signal : AbortSignal.any([options.signal, signal]),
            },
            report,
          ),
        catch: (cause) => failure("create", cause),
      }),
    ),
);
/**
 * Selects and queues one admitted record in an observed Effect.
 * @param lane - Destination lane.
 * @param record - Admitted record.
 * @param decision - Sampling decision.
 * @param report - Failure sink.
 * @returns An Effect completing after synchronous dispatch.
 * @example
 * Effect.runSync(dispatchLaneEffect(lane, record, "export", report));
 */
export const dispatchLaneEffect = Effect.fn("TelemetryLane.dispatch")(
  (
    lane: Lane,
    record: RedactedObservabilityRecord,
    decision: TelemetryExportDecision,
    report: (failure: TelemetryExporterFailure) => void,
  ) =>
    observe(
      "dispatch",
      Effect.sync(() => telemetryLaneCore.dispatchLane(lane, record, decision, report)),
    ),
);
/**
 * Waits for accepted work and flushes one lane.
 * @param lane - Lane to drain.
 * @param timeoutMs - Runtime flush timeout.
 * @param report - Failure sink.
 * @returns An Effect with completion or tagged unexpected failure.
 * @example
 * await Effect.runPromise(flushLaneEffect(lane, 1000, report));
 */
export const flushLaneEffect = Effect.fn("TelemetryLane.flush")(
  (lane: Lane, timeoutMs: number, report: (failure: TelemetryExporterFailure) => void) =>
    observe(
      "flush",
      Effect.tryPromise({
        try: () => telemetryLaneCore.flushLane(lane, timeoutMs, report),
        catch: (cause) => failure("flush", cause),
      }),
    ),
);
/**
 * Runs and observes one exporter lifecycle callback.
 * @param lane - Owning lane.
 * @param operation - Flush or close callback.
 * @param report - Failure sink.
 * @returns An Effect completing after callback settlement.
 * @example
 * await Effect.runPromise(settleLaneEffect(lane, () => lane.runtime?.close?.(), report));
 */
export const settleLaneEffect = Effect.fn("TelemetryLane.settle")(
  (lane: Lane, operation: () => unknown, report: (failure: TelemetryExporterFailure) => void) =>
    observe(
      "settle",
      Effect.tryPromise({
        try: () => telemetryLaneCore.settleLane(lane, operation, report),
        catch: (cause) => failure("settle", cause),
      }),
    ),
);
