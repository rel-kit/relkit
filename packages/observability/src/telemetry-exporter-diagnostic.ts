import { Clock, Duration, Effect, Metric } from "effect";
import type { ObservabilityRecord } from "./model.js";
import type { TelemetryExporterFailure } from "./telemetry-exporter.types.js";

/**
 * Builds a safe diagnostic with the Effect clock and operation telemetry.
 *
 * @param failure - Safe exporter failure without a raw provider cause.
 * @returns An Effect yielding a diagnostic record.
 * @example
 * Effect.runSync(telemetryExporterDiagnosticEffect(failure));
 */
export const telemetryExporterDiagnosticEffect = Effect.fn("ObservabilityExporter.diagnostic")(
  function* (failure: TelemetryExporterFailure) {
    const started = yield* Clock.currentTimeMillis;
    const record: ObservabilityRecord = {
      version: 2,
      signal: "diagnostic",
      code: failure.code,
      severity: "error",
      message: failure.message,
      occurredAt: new Date(started).toISOString(),
      descriptorId: `telemetry.exporters.${failure.exporter}`,
    };
    yield* Metric.update(Metric.counter("relkit_observability_exporter_diagnostics_total"), 1);
    yield* Metric.update(
      Metric.timer("relkit_observability_exporter_diagnostic_duration"),
      Duration.millis((yield* Clock.currentTimeMillis) - started),
    );
    return record;
  },
);

/**
 * Synchronous compatibility adapter for exporter failure diagnostics.
 *
 * @param failure - Safe exporter failure without a raw provider cause.
 * @returns A diagnostic record timestamped by the live Effect clock.
 * @example
 * telemetryExporterDiagnostic(failure);
 */
export function telemetryExporterDiagnostic(
  failure: TelemetryExporterFailure,
): ObservabilityRecord {
  return Effect.runSync(telemetryExporterDiagnosticEffect(failure));
}
