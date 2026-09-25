import { expect, test } from "vitest";
import { Effect, Metric } from "effect";
import { TestClock } from "effect/testing";
import {
  telemetryExporterDiagnostic,
  telemetryExporterDiagnosticEffect,
} from "../src/telemetry-exporter-diagnostic.js";
import type { TelemetryExporterFailure } from "../src/telemetry-exporter.types.js";

const failure: TelemetryExporterFailure = {
  exporter: "otlp",
  code: "RELKIT_TELEMETRY_EXPORTER_FAILED",
  message: "Telemetry exporter failed.",
};

test("the diagnostic Effect uses the injectable clock and records metrics", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-09-25T00:00:00.000Z"));
      const record = yield* telemetryExporterDiagnosticEffect(failure);
      const count = yield* Metric.value(
        Metric.counter("relkit_observability_exporter_diagnostics_total"),
      );
      const duration = yield* Metric.value(
        Metric.timer("relkit_observability_exporter_diagnostic_duration"),
      );
      return { record, count, duration };
    }).pipe(
      Effect.provide(TestClock.layer()),
      Effect.provideService(Metric.MetricRegistry, registry),
    ),
  );
  expect(result.record).toMatchObject({
    signal: "diagnostic",
    occurredAt: "2026-09-25T00:00:00.000Z",
    descriptorId: "telemetry.exporters.otlp",
  });
  expect(result.count.count).toBe(1);
  expect(result.duration.count).toBe(1);
  expect(telemetryExporterDiagnostic(failure)).toMatchObject({
    signal: "diagnostic",
    code: failure.code,
  });
});
