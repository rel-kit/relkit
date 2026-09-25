import { Effect } from "effect";
import { telemetryResolutionCore } from "./telemetry-exporter-resolution-core.js";
import { telemetryLaneCore } from "./telemetry-exporter-lane-core.js";
import type { Lane } from "./telemetry-exporter-lane.types.js";
import type {
  TelemetryExporterFailure,
  TelemetryExporterFanout,
  TelemetryExporterStatus,
} from "./telemetry-exporter.types.js";
import type { TelemetryExportRecord } from "./telemetry-sampling.js";
import type { TelemetryExporterFanoutOptions } from "./telemetry-exporters.types.js";
const MAX_PENDING_FAILURES = 128;
const { telemetryExporterFactory } = telemetryResolutionCore;
const { createLane, dispatchLane, flushLane, settleLane } = telemetryLaneCore;
/**
 * Acquires validated exporter lanes and exposes bounded, independent dispatch.
 *
 * @param options - Exporter definitions, modules, values, and failure sink.
 * @returns A fanout whose flush and close settle accepted records.
 * @throws {TypeError} If static exporter runtime metadata is invalid.
 * @example
 * const fanout = await createTelemetryExporterFanout({ exporters, modules });
 * await fanout.close();
 */
async function createTelemetryExporterFanout(
  options: TelemetryExporterFanoutOptions,
): Promise<TelemetryExporterFanout> {
  const pendingFailures: TelemetryExporterFailure[] = [];
  let failureHandler = options.onFailure;
  const report = (failure: TelemetryExporterFailure): void => {
    if (failureHandler !== undefined) return notify(failureHandler, failure);
    if (pendingFailures.length === MAX_PENDING_FAILURES) pendingFailures.shift();
    pendingFailures.push(failure);
  };
  const descriptors = Object.entries(options.exporters ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, descriptor]) => ({
      name,
      descriptor,
      factory: telemetryExporterFactory(descriptor, options.modules),
    }));
  const acquired: Lane[] = [];
  let lanes: readonly Lane[];
  try {
    lanes = await Effect.runPromise(
      Effect.forEach(
        descriptors,
        ({ name, descriptor, factory }) =>
          Effect.tryPromise({
            try: async (signal) => {
              const combined =
                options.signal === undefined ? signal : AbortSignal.any([options.signal, signal]);
              const lane = await createLane(
                name,
                descriptor,
                factory,
                { ...options, signal: combined },
                report,
              );
              if (combined.aborted) {
                await settleLane(lane, () => lane.runtime?.close?.(), report);
                throw new DOMException("Telemetry exporter acquisition aborted", "AbortError");
              }
              acquired.push(lane);
              return lane;
            },
            catch: (cause) => cause,
          }),
        { concurrency: 16 },
      ),
      { signal: options.signal },
    );
  } catch (error) {
    await forEachLane(acquired, (lane) => settleLane(lane, () => lane.runtime?.close?.(), report));
    throw error;
  }
  let closePromise: Promise<void> | undefined;
  const exportRecord: TelemetryExportRecord = (record, decision) => {
    for (const lane of lanes) dispatchLane(lane, record, decision, report);
  };
  const flush = async (timeoutMs = 1_000): Promise<void> => {
    await forEachLane(lanes, (lane) => flushLane(lane, timeoutMs, report));
  };
  const close = (timeoutMs = 1_000): Promise<void> =>
    (closePromise ??= (async () => {
      for (const lane of lanes) lane.closed = true;
      await flush(timeoutMs);
      await forEachLane(lanes, (lane) =>
        settleLane(lane, () => lane.runtime?.close?.(timeoutMs), report),
      );
    })());
  const setFailureHandler = (handler: (failure: TelemetryExporterFailure) => void): void => {
    const previous = failureHandler;
    failureHandler =
      previous === undefined
        ? handler
        : (failure) => {
            notify(previous, failure);
            notify(handler, failure);
          };
    for (const failure of pendingFailures.splice(0)) notify(handler, failure);
  };
  return Object.freeze({
    exportRecord,
    flush,
    close,
    stats: () => statuses(lanes),
    setFailureHandler,
  });
}
function forEachLane(lanes: readonly Lane[], run: (lane: Lane) => Promise<void>): Promise<void> {
  return Effect.runPromise(
    Effect.forEach(lanes, (lane) => Effect.promise(() => run(lane)), {
      concurrency: 16,
      discard: true,
    }),
  );
}
function notify(
  handler: (failure: TelemetryExporterFailure) => void,
  failure: TelemetryExporterFailure,
): void {
  try {
    handler(failure);
  } catch {
    // Failure reporting cannot re-enter or fail an exporter lane.
  }
}
function statuses(lanes: readonly Lane[]): readonly TelemetryExporterStatus[] {
  return Object.freeze(
    lanes.map((lane) => {
      const runtime = lane.runtime?.stats?.() ?? {};
      return Object.freeze({
        name: lane.name,
        integrationId: lane.descriptor.integrationId,
        adapterId: lane.descriptor.adapterId,
        healthy: lane.runtime !== undefined && lane.failures + (runtime.failures ?? 0) === 0,
        received: lane.received,
        selected: lane.selected,
        exported: lane.exported,
        sampledOut: lane.sampledOut,
        severityFiltered: lane.severityFiltered,
        failures: lane.failures + (runtime.failures ?? 0),
        queuedRecords: lane.waiting.length + (runtime.queuedRecords ?? 0),
        queuedUnits: runtime.queuedUnits ?? 0,
        droppedRecords: lane.droppedRecords + (runtime.droppedRecords ?? 0),
        droppedUnits: lane.droppedUnits + (runtime.droppedUnits ?? 0),
      });
    }),
  );
}
export const telemetryExportersCore = { createTelemetryExporterFanout };
