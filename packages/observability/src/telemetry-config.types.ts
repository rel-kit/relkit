import type { LogLevel, ObservabilitySignal } from "./model.js";
import type { RedactionPolicy } from "./redaction.types.js";
import type { TELEMETRY_EXPORTER_PROTOCOL_VERSION } from "./telemetry-config.js";

/** Static identity and configuration for one telemetry exporter. */
export interface TelemetryExporterDescriptor<
  IntegrationId extends string = string,
  AdapterId extends string = string,
  Configuration extends object = object,
> {
  readonly kind: "telemetry-exporter";
  readonly protocolVersion: typeof TELEMETRY_EXPORTER_PROTOCOL_VERSION;
  readonly integrationId: IntegrationId;
  readonly adapterId: AdapterId;
  readonly configuration: Configuration;
}

/** Exporter names mapped to their static descriptors. */
export type TelemetryExporterMap = Readonly<
  Record<string, TelemetryExporterDescriptor<string, string, object>>
>;

/** Captured record signals, or all signals when omitted. */
export interface TelemetryCapturePolicy {
  readonly signals?: readonly ObservabilitySignal[];
}

/** Bounds for local observability retention. */
export interface TelemetryLocalRetentionPolicy {
  readonly maxRecords?: number;
  readonly maxAgeMs?: number;
  readonly maxBytes?: number;
  readonly maxEntries?: number;
}

/** Sampling rate and minimum log severity for external export. */
export interface TelemetryExportSamplingPolicy {
  readonly traceRate?: number;
  readonly minimumLogLevel?: LogLevel;
}

/** Capture, redaction, storage, sampling, and exporter configuration. */
export interface TelemetryConfiguration<
  Exporters extends TelemetryExporterMap = TelemetryExporterMap,
> {
  readonly capture?: TelemetryCapturePolicy;
  readonly redaction?: RedactionPolicy;
  readonly localRetention?: TelemetryLocalRetentionPolicy;
  readonly exportSampling?: TelemetryExportSamplingPolicy;
  readonly exporters?: Exporters;
}
