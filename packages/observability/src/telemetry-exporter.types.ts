import type { JsonValue } from "@relkit/contracts";
import type { RedactedObservabilityRecord } from "./record-admission.js";
import type { TelemetryExportRecord } from "./telemetry-sampling.js";

/**
 * Runtime queue and failure counters reported by an exporter.
 *
 * @example
 * const stats: TelemetryExporterRuntimeStats = { queuedRecords: 2, failures: 0 };
 */
export interface TelemetryExporterRuntimeStats {
  readonly queuedRecords?: number;
  readonly queuedUnits?: number;
  readonly droppedRecords?: number;
  readonly droppedUnits?: number;
  readonly failures?: number;
}

/**
 * One integration's export handle. The fanout owns its flush and close lifecycle.
 *
 * @example
 * const runtime: TelemetryExporterRuntime = { exportRecord: async (record) => send(record) };
 */
export interface TelemetryExporterRuntime {
  /** @param record - Redacted record. @returns Completion after accepting the record. */
  readonly exportRecord: (record: RedactedObservabilityRecord) => void | Promise<void>;
  /** @param timeoutMs - Optional deadline in milliseconds. @returns Completion after queued work settles. */
  readonly flush?: (timeoutMs?: number) => Promise<unknown>;
  /** @param timeoutMs - Optional deadline in milliseconds. @returns Completion after release. */
  readonly close?: (timeoutMs?: number) => Promise<unknown>;
  /** @returns Current bounded runtime counters. */
  readonly stats?: () => TelemetryExporterRuntimeStats;
}

/**
 * Factory input with resolved configuration and cancellation signal.
 *
 * @example
 * const context: TelemetryExporterFactoryContext = { name: "otlp", configuration: {} };
 */
export interface TelemetryExporterFactoryContext {
  readonly name: string;
  readonly configuration: Readonly<Record<string, JsonValue>>;
  readonly signal?: AbortSignal;
}

/**
 * Public health and throughput snapshot of one exporter lane.
 *
 * @example
 * const healthy = fanout.stats().every((status) => status.healthy);
 */
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

/**
 * Safe diagnostic emitted for an exporter failure without leaking its cause.
 *
 * @example
 * const code: TelemetryExporterFailure["code"] = "RELKIT_TELEMETRY_EXPORTER_FAILED";
 */
export interface TelemetryExporterFailure {
  readonly exporter: string;
  readonly code: "RELKIT_TELEMETRY_EXPORTER_FAILED";
  readonly message: "Telemetry exporter failed.";
}

/**
 * Multi-exporter handle. Call close after the last record to release each lane.
 *
 * @example
 * fanout.exportRecord(record, "export");
 * await fanout.close();
 */
export interface TelemetryExporterFanout {
  /** @param record - Redacted record. @param decision - Sampling result. @returns Export dispatch completion. */
  readonly exportRecord: TelemetryExportRecord;
  /** @param timeoutMs - Optional deadline in milliseconds. @returns Completion after pending exports flush. */
  readonly flush: (timeoutMs?: number) => Promise<void>;
  /** @param timeoutMs - Optional deadline in milliseconds. @returns Completion after lanes release. */
  readonly close: (timeoutMs?: number) => Promise<void>;
  /** @returns A frozen health and throughput snapshot for every exporter lane. */
  readonly stats: () => readonly TelemetryExporterStatus[];
  /** @param handler - Safe failure notification callback. @returns Nothing after registration. */
  readonly setFailureHandler: (handler: (failure: TelemetryExporterFailure) => void) => void;
}
