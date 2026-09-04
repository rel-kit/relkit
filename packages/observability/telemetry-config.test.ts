import { expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createObservabilityRuntime,
  defineTelemetryExporter,
  normalizeTelemetryConfiguration,
  telemetryExportDecision,
  traceIsSampled,
} from "./src/index.ts";

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

test("persists and streams captured records before root-consistent export sampling", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-telemetry-pipeline-"));
  const exported: string[] = [];
  let persistedBeforeExport = false;
  try {
    const runtime = await createObservabilityRuntime({
      root,
      configuration: {
        capture: { signals: ["log", "span"] },
        redaction: { redactKeys: ["tenant"] },
        exportSampling: { traceRate: 1 },
      },
      exportRecord: async (record, decision) => {
        if (decision !== "export") return;
        exported.push(record.signal);
        if (record.signal !== "log") return;
        const directory = join(root, "logs", "2026-09-02");
        const files = await readdir(directory);
        persistedBeforeExport = (await readFile(join(directory, files[0]!), "utf8")).includes(
          '"message":"kept locally"',
        );
      },
    });
    runtime.collect({
      version: 2,
      signal: "log",
      timestamp: "2026-09-02T00:00:00.000Z",
      level: "info",
      component: "test",
      message: "kept locally",
      fields: { tenant: "secret-tenant" },
      traceId: "20000000000000000000000000000002",
    });
    for (const [spanId, parentSpanId] of [
      ["2000000000000001", undefined],
      ["2000000000000002", "2000000000000001"],
    ] as const) {
      runtime.collect({
        version: 2,
        signal: "span",
        spanId,
        invocationId: "invocation-1",
        traceId: "20000000000000000000000000000002",
        name: spanId,
        kind: "internal",
        ...(parentSpanId === undefined ? {} : { parentSpanId }),
        status: "started",
        revision: 0,
        startedAt: "2026-09-02T00:00:00.000Z",
      });
    }
    runtime.collect({
      version: 2,
      signal: "diagnostic",
      code: "RELKIT_CAPTURED_OUT",
      severity: "error",
      message: "excluded by capture policy",
      occurredAt: "2026-09-02T00:00:00.000Z",
    });

    await runtime.flush();
    expect(runtime.readRecords().map((record) => record.signal)).toEqual(["log", "span", "span"]);
    expect(runtime.stream.replay().events.map((event) => event.type)).toEqual([
      "log.emitted",
      "span.started",
      "span.started",
    ]);
    expect(traceIsSampled("00000000000000000000000000000003", 0.5)).toBe(true);
    expect(traceIsSampled("00000000000000000000000000000001", 0.5)).toBe(false);
    expect((await runtime.query.trace("20000000000000000000000000000002"))?.spans).toHaveLength(2);
    expect(exported).toEqual(["log", "span", "span"]);
    expect(runtime.exportCounters()).toEqual({
      persisted: 3,
      streamed: 3,
      exportSelected: 3,
      sampledOut: 0,
      severityFiltered: 0,
      exportFailures: 0,
    });
    expect(persistedBeforeExport).toBe(true);
    expect(JSON.stringify(runtime.readRecords())).not.toContain("secret-tenant");
    await runtime.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

test("applies configured redaction and bounded local memory retention", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-telemetry-config-"));
  try {
    const runtime = await createObservabilityRuntime({
      root,
      configuration: {
        redaction: { redactKeys: ["tenant"] },
        localRetention: { maxRecords: 1, maxEntries: 2, maxBytes: 4_096, maxAgeMs: 60_000 },
      },
    });
    for (const message of ["first", "second"]) {
      runtime.collect({
        version: 2,
        signal: "log",
        timestamp: "2026-09-02T00:00:00.000Z",
        level: "info",
        component: "test",
        message,
        fields: { tenant: "secret-tenant" },
      });
    }
    expect(runtime.readRecords()).toHaveLength(1);
    expect(JSON.stringify(runtime.readRecords())).not.toContain("secret-tenant");
    await runtime.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
