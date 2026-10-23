/** Checks telemetry policy normalization, log severity filtering and consistent sampling across trace-associated records. */
import { expect, test } from "vitest";
import {
  defineTelemetryExporter,
  normalizeTelemetryConfiguration,
  telemetryExportDecision,
} from "../src/index.ts";

test("normalizes typed telemetry policy and exporter configuration", () => {
  const config = normalizeTelemetryConfiguration({
    capture: { signals: ["trace", "log", "trace"] },
    redaction: { mode: "development-redacted", maxBytes: 512, redactKeys: ["tenant"] },
    localRetention: { maxRecords: 2, maxAgeMs: 1_000, maxBytes: 4_096, maxEntries: 8 },
    exportSampling: { traceRate: 0.25 },
    exporters: {
      traces: defineTelemetryExporter("otlp", "otlp", {
        endpoint: "https://otel.example.test",
      }),
      errors: defineTelemetryExporter("sentry", "sentry", { dsn: "dsn" }),
    },
  });

  expect(config.capture?.signals).toEqual(["log", "trace"]);
  expect(Object.keys(config.exporters ?? {})).toEqual(["errors", "traces"]);
  expect(Object.isFrozen(config)).toBe(true);
  expect(() => normalizeTelemetryConfiguration({ exportSampling: { traceRate: 2 } })).toThrow(
    "trace rate",
  );
  expect(() =>
    normalizeTelemetryConfiguration({
      exportSampling: { minimumLogLevel: "notice" as never },
    }),
  ).toThrow("minimum log level");
  expect(() => normalizeTelemetryConfiguration({ legacy: true } as never)).toThrow(
    'Unknown telemetry option "legacy"',
  );
  expect(normalizeTelemetryConfiguration({ capture: {}, exportSampling: {} })).toEqual({
    capture: {},
    exportSampling: {},
  });
});

test("filters log severity and samples every trace-associated record consistently", () => {
  expect(
    telemetryExportDecision(
      {
        version: 2,
        signal: "log",
        timestamp: "2026-09-02T00:00:00.000Z",
        level: "debug",
        component: "test",
        message: "local detail",
        fields: {},
      },
      { minimumLogLevel: "info" },
    ),
  ).toBe("severity-filtered");
  const span = {
    version: 2 as const,
    signal: "span" as const,
    spanId: "2000000000000001",
    invocationId: "invocation-1",
    traceId: "20000000000000000000000000000002",
    name: "test",
    kind: "internal" as const,
    status: "completed" as const,
    revision: 1,
    startedAt: "2026-09-02T00:00:00.000Z",
    completedAt: "2026-09-02T00:00:00.001Z",
    durationMs: 1,
  };
  expect(telemetryExportDecision({ ...span, outcome: "success" }, { traceRate: 0 })).toBe(
    "sampled-out",
  );
  expect(telemetryExportDecision({ ...span, outcome: "defect" }, { traceRate: 0 })).toBe(
    "sampled-out",
  );
  expect(
    telemetryExportDecision(
      {
        version: 2,
        signal: "diagnostic",
        code: "RELKIT_TEST",
        severity: "info",
        message: "diagnostic",
        occurredAt: "2026-09-02T00:00:00.000Z",
      },
      { traceRate: 0 },
    ),
  ).toBe("export");
});
