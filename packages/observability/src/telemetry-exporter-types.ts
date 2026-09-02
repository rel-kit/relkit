import type { JsonValue } from "@relkit/contracts";
import type { RedactedObservabilityRecord } from "./record-admission.js";
import type { TelemetryExportRecord } from "./telemetry-sampling.js";

export interface TelemetryExporterRuntimeStats {
  readonly queuedRecords?: number;
  readonly queuedUnits?: number;
  readonly droppedRecords?: number;
  readonly droppedUnits?: number;
  readonly failures?: number;
}

export interface TelemetryExporterRuntime {
  readonly exportRecord: (record: RedactedObservabilityRecord) => void | Promise<void>;
  readonly flush?: (timeoutMs?: number) => Promise<unknown>;
  readonly close?: (timeoutMs?: number) => Promise<unknown>;
  readonly stats?: () => TelemetryExporterRuntimeStats;
}

export interface TelemetryExporterFactoryContext {
  readonly name: string;
  readonly configuration: Readonly<Record<string, JsonValue>>;
  readonly signal?: AbortSignal;
}

export interface TelemetryExporterStatus {
  readonly name: string;
  readonly integrationId: string;
  readonly adapterId: string;
  readonly healthy: boolean;
  readonly received: number;
  readonly selected: number;
  readonly exported: number;
  readonly sampledOut: number;
  readonly severityFiltered: number;
  readonly failures: number;
  readonly queuedRecords: number;
  readonly queuedUnits: number;
  readonly droppedRecords: number;
  readonly droppedUnits: number;
}

export interface TelemetryExporterFailure {
  readonly exporter: string;
  readonly code: "RELKIT_TELEMETRY_EXPORTER_FAILED";
  readonly message: "Telemetry exporter failed.";
}

export interface TelemetryExporterFanout {
  readonly exportRecord: TelemetryExportRecord;
  readonly flush: (timeoutMs?: number) => Promise<void>;
  readonly close: (timeoutMs?: number) => Promise<void>;
  readonly stats: () => readonly TelemetryExporterStatus[];
  readonly setFailureHandler: (handler: (failure: TelemetryExporterFailure) => void) => void;
}
