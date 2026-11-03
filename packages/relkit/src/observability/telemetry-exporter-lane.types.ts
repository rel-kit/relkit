import type { RedactedObservabilityRecord } from "./record-admission.js";
import type { TelemetryExporterDescriptor } from "./telemetry-config.js";
import type { TelemetryExporterRuntime } from "./telemetry-exporter.types.js";

/** Mutable state for one independently bounded exporter lane. */
export interface Lane {
  readonly descriptor: TelemetryExporterDescriptor;
  readonly name: string;
  readonly pending: Set<Promise<void>>;
  readonly waiting: RedactedObservabilityRecord[];
  runtime?: TelemetryExporterRuntime;
  closed: boolean;
  received: number;
  selected: number;
  exported: number;
  sampledOut: number;
  severityFiltered: number;
  failures: number;
  droppedRecords: number;
  droppedUnits: number;
}
