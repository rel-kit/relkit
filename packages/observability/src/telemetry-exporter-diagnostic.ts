import type { ObservabilityRecord } from "./model.js";
import type { TelemetryExporterFailure } from "./telemetry-exporter-types.js";

export function telemetryExporterDiagnostic(
  failure: TelemetryExporterFailure,
): ObservabilityRecord {
  return {
    version: 1,
    signal: "diagnostic",
    code: failure.code,
    severity: "error",
    message: failure.message,
    occurredAt: new Date().toISOString(),
    descriptorId: `telemetry.exporters.${failure.exporter}`,
  };
}
