import type { RedactedObservabilityRecord } from "./record-admission.js";
import type { TelemetryExporterDescriptor, TelemetryExporterMap } from "./telemetry-config.js";
import {
  resolveTelemetryExporterConfiguration,
  telemetryExporterFactory,
} from "./telemetry-exporter-resolution.js";
import type {
  TelemetryExporterFailure,
  TelemetryExporterFanout,
  TelemetryExporterRuntime,
  TelemetryExporterStatus,
} from "./telemetry-exporter-types.js";
import type { TelemetryExportDecision, TelemetryExportRecord } from "./telemetry-sampling.js";

interface Lane {
  readonly descriptor: TelemetryExporterDescriptor;
  readonly name: string;
  readonly pending: Set<Promise<void>>;
  runtime?: TelemetryExporterRuntime;
  received: number;
  selected: number;
  exported: number;
  sampledOut: number;
  severityFiltered: number;
  failures: number;
  droppedRecords: number;
  droppedUnits: number;
}

export async function createTelemetryExporterFanout(options: {
  readonly exporters?: TelemetryExporterMap;
  readonly modules: readonly { readonly module: unknown }[];
  readonly values?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
  readonly onFailure?: (failure: TelemetryExporterFailure) => void;
}): Promise<TelemetryExporterFanout> {
  const pendingFailures: TelemetryExporterFailure[] = [];
  let failureHandler = options.onFailure;
  const report = (failure: TelemetryExporterFailure): void => {
    if (failureHandler === undefined) pendingFailures.push(failure);
    else notify(failureHandler, failure);
  };
  const lanes = await Promise.all(
    Object.entries(options.exporters ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(async ([name, descriptor]) => createLane(name, descriptor, options, report)),
  );
  const exportRecord: TelemetryExportRecord = (record, decision) => {
    for (const lane of lanes) dispatch(lane, record, decision, report);
  };
  const flush = async (timeoutMs = 1_000): Promise<void> => {
    await Promise.all(lanes.map((lane) => flushLane(lane, timeoutMs, report)));
  };
  const close = async (timeoutMs = 1_000): Promise<void> => {
    await flush(timeoutMs);
    await Promise.all(
      lanes.map((lane) => settle(lane, () => lane.runtime?.close?.(timeoutMs), report)),
    );
  };
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

async function createLane(
  name: string,
  descriptor: TelemetryExporterDescriptor,
  options: Parameters<typeof createTelemetryExporterFanout>[0],
  report: (failure: TelemetryExporterFailure) => void,
): Promise<Lane> {
  const lane: Lane = {
    name,
    descriptor,
    pending: new Set(),
    received: 0,
    selected: 0,
    exported: 0,
    sampledOut: 0,
    severityFiltered: 0,
    failures: 0,
    droppedRecords: 0,
    droppedUnits: 0,
  };
  const factory = telemetryExporterFactory(descriptor, options.modules);
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
    failed(lane, report);
  }
  return lane;
}

function dispatch(
  lane: Lane,
  record: RedactedObservabilityRecord,
  decision: TelemetryExportDecision,
  report: (failure: TelemetryExporterFailure) => void,
): void {
  lane.received += 1;
  if (decision === "sampled-out") return void (lane.sampledOut += 1);
  if (decision === "severity-filtered") return void (lane.severityFiltered += 1);
  lane.selected += 1;
  if (lane.runtime === undefined) return void (lane.droppedRecords += 1);
  const work = Promise.resolve()
    .then(() => lane.runtime!.exportRecord(record))
    .then(
      () => void (lane.exported += 1),
      () => failed(lane, report),
    );
  lane.pending.add(work);
  void work.finally(() => lane.pending.delete(work));
}

async function flushLane(
  lane: Lane,
  timeoutMs: number,
  report: (failure: TelemetryExporterFailure) => void,
): Promise<void> {
  await Promise.all([...lane.pending]);
  await settle(lane, () => lane.runtime?.flush?.(timeoutMs), report);
}

async function settle(
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
        queuedRecords: runtime.queuedRecords ?? 0,
        queuedUnits: runtime.queuedUnits ?? 0,
        droppedRecords: lane.droppedRecords + (runtime.droppedRecords ?? 0),
        droppedUnits: lane.droppedUnits + (runtime.droppedUnits ?? 0),
      });
    }),
  );
}
