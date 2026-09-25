import { Effect } from "effect";
import type { RedactedObservabilityRecord } from "./record-admission.js";
import type { TelemetryExporterDescriptor } from "./telemetry-config.js";
import type { TelemetryExporterFailure } from "./telemetry-exporter.types.js";
import type { TelemetryExportDecision } from "./telemetry-sampling.js";
import type { Lane } from "./telemetry-exporter-lane.types.js";
import type { TelemetryExporterFanoutOptions } from "./telemetry-exporters.types.js";
import type { telemetryExporterFactory } from "./telemetry-exporter-resolution.js";
import {
  createLaneEffect,
  dispatchLaneEffect,
  flushLaneEffect,
  settleLaneEffect,
  type TelemetryLaneError,
} from "./telemetry-exporter-lane-effect.js";
export {
  TelemetryLaneError,
  createLaneEffect,
  dispatchLaneEffect,
  flushLaneEffect,
  settleLaneEffect,
} from "./telemetry-exporter-lane-effect.js";
function legacy(error: TelemetryLaneError): Error {
  return error.cause instanceof Error ? error.cause : new Error(error.message);
}
/**
 * Opens one exporter lane and records a failed lane for runtime failures.
 * @param name - Stable exporter name.
 * @param descriptor - Exporter identity and configuration.
 * @param factory - Validated runtime factory.
 * @param options - Runtime values and cancellation signal.
 * @param report - Bounded failure notification sink.
 * @returns The initialized or failed lane.
 * @example
 * const lane = await createLane("logs", descriptor, factory, options, report);
 */
export function createLane(
  name: string,
  descriptor: TelemetryExporterDescriptor,
  factory: ReturnType<typeof telemetryExporterFactory>,
  options: TelemetryExporterFanoutOptions,
  report: (failure: TelemetryExporterFailure) => void,
): Promise<Lane> {
  return Effect.runPromise(
    createLaneEffect(name, descriptor, factory, options, report).pipe(Effect.mapError(legacy)),
  );
}
/**
 * Queues one record for a lane without blocking other exporters.
 * @param lane - Destination lane.
 * @param record - Admitted record.
 * @param decision - Sampling decision.
 * @param report - Bounded failure sink.
 * @returns Nothing after dispatch.
 * @example
 * dispatchLane(lane, record, "export", report);
 */
export function dispatchLane(
  lane: Lane,
  record: RedactedObservabilityRecord,
  decision: TelemetryExportDecision,
  report: (failure: TelemetryExporterFailure) => void,
): void {
  Effect.runSync(dispatchLaneEffect(lane, record, decision, report));
}
/**
 * Drains accepted records and flushes the exporter.
 * @param lane - Lane to drain.
 * @param timeoutMs - Flush timeout.
 * @param report - Failure sink.
 * @returns Completion after the lane drains.
 * @example
 * await flushLane(lane, 1000, report);
 */
export function flushLane(
  lane: Lane,
  timeoutMs: number,
  report: (failure: TelemetryExporterFailure) => void,
): Promise<void> {
  return Effect.runPromise(flushLaneEffect(lane, timeoutMs, report).pipe(Effect.mapError(legacy)));
}
/**
 * Runs a lifecycle callback and records a failure if it rejects.
 * @param lane - Owning exporter lane.
 * @param operation - Flush or close callback.
 * @param report - Failure sink.
 * @returns Completion after the callback settles.
 * @example
 * await settleLane(lane, () => lane.runtime?.close?.(), report);
 */
export function settleLane(
  lane: Lane,
  operation: () => unknown,
  report: (failure: TelemetryExporterFailure) => void,
): Promise<void> {
  return Effect.runPromise(settleLaneEffect(lane, operation, report).pipe(Effect.mapError(legacy)));
}
