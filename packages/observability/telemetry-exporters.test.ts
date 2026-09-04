import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  admitObservabilityRecord,
  createObservabilityRuntime,
  createTelemetryExporterFanout,
  defineTelemetryExporter,
  type RedactedObservabilityRecord,
  type TelemetryExporterFactoryContext,
  type TelemetryExporterRuntime,
} from "./src/index.ts";

test("loads static exporters and fans out without cross-exporter blocking", async () => {
  const fast: string[] = [];
  const slow: string[] = [];
  const failures: unknown[] = [];
  let release: (() => void) | undefined;
  const fanout = await createTelemetryExporterFanout({
    exporters: {
      fast: exporter("fast"),
      slow: exporter("slow"),
      failing: exporter("failing"),
    },
    modules: [
      runtimeModule("fast", ({ configuration }) => {
        expect(configuration.token).toBe("resolved-token");
        return sink((record) => void fast.push(record.signal));
      }),
      runtimeModule("slow", () =>
        sink(
          (record) =>
            new Promise<void>((resolve) => {
              release = () => {
                slow.push(record.signal);
                resolve();
              };
            }),
        ),
      ),
      runtimeModule("failing", () =>
        sink(() => {
          throw new Error("token=must-not-escape");
        }),
      ),
    ],
    values: { EXPORT_TOKEN: "resolved-token" },
    onFailure: (failure) => failures.push(failure),
  });
  const record = admitted();
  fanout.exportRecord(record, "export");
  fanout.exportRecord(record, "sampled-out");
  fanout.exportRecord(record, "severity-filtered");
  await Promise.resolve();
  await Promise.resolve();

  expect(fast).toEqual(["log"]);
  expect(slow).toEqual([]);
  expect(failures).toEqual([
    {
      exporter: "failing",
      code: "RELKIT_TELEMETRY_EXPORTER_FAILED",
      message: "Telemetry exporter failed.",
    },
  ]);
  release?.();
  await fanout.flush();
  expect(slow).toEqual(["log"]);
  expect(
    fanout
      .stats()
      .map(
        ({
          name,
          healthy,
          received,
          selected,
          exported,
          sampledOut,
          severityFiltered,
          failures: count,
        }) => ({
          name,
          healthy,
          received,
          selected,
          exported,
          sampledOut,
          severityFiltered,
          failures: count,
        }),
      ),
  ).toEqual([stats("failing", false, 0, 1), stats("fast", true, 1, 0), stats("slow", true, 1, 0)]);
  expect(JSON.stringify(failures)).not.toContain("must-not-escape");
  await fanout.close();
});

test("persists exporter failures as redacted local-only diagnostics", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-exporter-failure-"));
  try {
    const fanout = await createTelemetryExporterFanout({
      exporters: { failing: defineTelemetryExporter("failing", "failing", {}) },
      modules: [
        runtimeModule("failing", () =>
          sink(() => {
            throw new Error("authorization=must-not-escape");
          }),
        ),
      ],
    });
    const runtime = await createObservabilityRuntime({
      root,
      configuration: { capture: { signals: ["log"] } },
      exporter: fanout,
    });
    runtime.collect(admitted());
    await runtime.flush();

    expect(runtime.readRecords().map((record) => record.signal)).toEqual(["log", "diagnostic"]);
    expect(runtime.stream.replay().events.map((event) => event.type)).toEqual([
      "log.emitted",
      "diagnostic.changed",
    ]);
    expect(fanout.stats()[0]).toMatchObject({ failures: 1, received: 1 });
    expect(JSON.stringify(runtime.readRecords())).not.toContain("must-not-escape");
    await runtime.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("isolates missing values but rejects missing static runtime metadata", async () => {
  const failures: unknown[] = [];
  const disabled = await createTelemetryExporterFanout({
    exporters: { fast: exporter("fast") },
    modules: [runtimeModule("fast", () => sink(() => undefined))],
    onFailure: (failure) => failures.push(failure),
  });
  disabled.exportRecord(admitted(), "export");
  expect(disabled.stats()[0]).toMatchObject({ healthy: false, failures: 1, droppedRecords: 1 });
  expect(JSON.stringify(failures)).not.toContain("EXPORT_TOKEN");
  await expect(
    createTelemetryExporterFanout({
      exporters: { fast: exporter("fast") },
      modules: [],
    }),
  ).rejects.toThrow("runtime metadata is invalid");
});

function exporter(id: string) {
  return defineTelemetryExporter(id, id, {
    token: {
      kind: "binding-value-ref",
      name: "EXPORT_TOKEN",
      type: "secret-string",
      sensitive: true,
    },
  });
}

function runtimeModule(
  id: string,
  create: (context: TelemetryExporterFactoryContext) => TelemetryExporterRuntime,
) {
  return {
    module: {
      runtimeIntegration: {
        kind: "runtime-integration",
        integrationId: id,
        registrations: [{ capability: "telemetry", adapterId: id, protocolVersion: 1 }],
      },
      createTelemetryExporter: async (context: TelemetryExporterFactoryContext) => create(context),
    },
  };
}

function sink(exportRecord: TelemetryExporterRuntime["exportRecord"]): TelemetryExporterRuntime {
  return { exportRecord, flush: () => Promise.resolve(), close: () => Promise.resolve() };
}

function admitted(): RedactedObservabilityRecord {
  return admitObservabilityRecord({
    version: 2,
    signal: "log",
    timestamp: "2026-09-02T00:00:00.000Z",
    level: "info",
    component: "test",
    message: "safe",
    fields: {},
  })!;
}

function stats(name: string, healthy: boolean, exported: number, failures: number) {
  return {
    name,
    healthy,
    received: 3,
    selected: 1,
    exported,
    sampledOut: 1,
    severityFiltered: 1,
    failures,
  };
}
