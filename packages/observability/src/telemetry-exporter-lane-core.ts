import type { RedactedObservabilityRecord } from "./record-admission.js";
import type { TelemetryExporterDescriptor } from "./telemetry-config.js";
import { telemetryResolutionCore } from "./telemetry-exporter-resolution-core.js";
import type { TelemetryExporterFailure } from "./telemetry-exporter.types.js";
import type { TelemetryExportDecision } from "./telemetry-sampling.js";
import type { Lane } from "./telemetry-exporter-lane.types.js";
import type { TelemetryExporterFanoutOptions } from "./telemetry-exporters.types.js";
const MAX_IN_FLIGHT_EXPORTS = 16;
const MAX_WAITING_EXPORTS = 1_024;
const { resolveTelemetryExporterConfiguration, telemetryExporterFactory } = telemetryResolutionCore;
/**
 * Opens one exporter lane, recording a failed lane for runtime failures.
 *
 * @param name - Stable exporter name.
 * @param descriptor - Exporter identity and configuration.
 * @param factory - Validated runtime factory.
 * @param options - Runtime values and cancellation signal.
 * @param report - Bounded failure notification sink.
 * @returns The initialized or failed lane.
 * @example
 * const lane = await createLane("logs", descriptor, factory, options, report);
 */
async function createLane(
  name: string,
  descriptor: TelemetryExporterDescriptor,
  factory: ReturnType<typeof telemetryExporterFactory>,
  options: TelemetryExporterFanoutOptions,
  report: (failure: TelemetryExporterFailure) => void,
): Promise<Lane> {
  const lane: Lane = {
    name,
    descriptor,
    pending: new Set(),
    waiting: [],
    closed: false,
    received: 0,
    selected: 0,
    exported: 0,
    sampledOut: 0,
    severityFiltered: 0,
    failures: 0,
    droppedRecords: 0,
    droppedUnits: 0,
  };
  try {
    lane.runtime = await factory({
      name,
      configuration: resolveTelemetryExporterConfiguration(
        name,
        descriptor.configuration,
        options.values,
      ),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch {
    if (!options.signal?.aborted) failed(lane, report);
  }
  return lane;
}
/**
 * Selects and queues one record without blocking another exporter.
 *
 * @param lane - Destination exporter lane.
 * @param record - Admitted record.
 * @param decision - Sampling decision.
 * @param report - Failure notification sink.
 * @returns Nothing; accepted work completes before `flushLane`.
 * @example
 * dispatchLane(lane, record, "export", report);
 */
function dispatchLane(
  lane: Lane,
  record: RedactedObservabilityRecord,
  decision: TelemetryExportDecision,
  report: (failure: TelemetryExporterFailure) => void,
): void {
  lane.received += 1;
  if (decision === "sampled-out") return void (lane.sampledOut += 1);
  if (decision === "severity-filtered") return void (lane.severityFiltered += 1);
  lane.selected += 1;
  if (lane.closed) return void (lane.droppedRecords += 1);
  if (lane.runtime === undefined) return void (lane.droppedRecords += 1);
  if (lane.pending.size >= MAX_IN_FLIGHT_EXPORTS) {
    if (lane.waiting.length >= MAX_WAITING_EXPORTS) {
      lane.droppedRecords += 1;
      failed(lane, report);
    } else lane.waiting.push(record);
    return;
  }
  startExport(lane, record, report);
}
function startExport(
  lane: Lane,
  record: RedactedObservabilityRecord,
  report: (failure: TelemetryExporterFailure) => void,
): void {
  const work = Promise.resolve()
    .then(() => lane.runtime!.exportRecord(record))
    .then(
      () => void (lane.exported += 1),
      () => failed(lane, report),
    );
  lane.pending.add(work);
  void work.finally(() => {
    lane.pending.delete(work);
    const next = lane.waiting.shift();
    if (next !== undefined) startExport(lane, next, report);
  });
}
/**
 * Waits for accepted work and flushes the exporter runtime.
 *
 * @param lane - Lane to drain.
 * @param timeoutMs - Runtime flush timeout in milliseconds.
 * @param report - Failure notification sink.
 * @returns Completion after all accepted work settles.
 * @example
 * await flushLane(lane, 1000, report);
 */
async function flushLane(
  lane: Lane,
  timeoutMs: number,
  report: (failure: TelemetryExporterFailure) => void,
): Promise<void> {
  while (lane.pending.size > 0 || lane.waiting.length > 0) await Promise.all([...lane.pending]);
  await settleLane(lane, () => lane.runtime?.flush?.(timeoutMs), report);
}
/**
 * Runs a lifecycle callback and records its failure.
 *
 * @param lane - Owning exporter lane.
 * @param operation - Flush or close callback.
 * @param report - Failure notification sink.
 * @returns Completion after the callback settles.
 * @example
 * await settleLane(lane, () => lane.runtime?.close?.(), report);
 */
async function settleLane(
  lane: Lane,
  operation: () => unknown,
  report: (failure: TelemetryExporterFailure) => void,
): Promise<void> {
  try {
    await operation();
  } catch {
    failed(lane, report);
  }
}
function failed(lane: Lane, report: (failure: TelemetryExporterFailure) => void): void {
  lane.failures += 1;
  report({
    exporter: lane.name,
    code: "RELKIT_TELEMETRY_EXPORTER_FAILED",
    message: "Telemetry exporter failed.",
  });
}
export const telemetryLaneCore = { createLane, dispatchLane, flushLane, settleLane };
