/**
 * Export counters mean what their labels say: without a configured exporter (the generated
 * server always passes a fan-out, which then has zero lanes) no export queue exists and the
 * failure counter stays at zero under any load; with an exporter, a failed export and a record
 * rejected by the full export queue are counted apart.
 */
import { expect, test, vi } from "vitest";
import {
  createObservabilityRuntime,
  createTelemetryExporterFanout,
} from "../../src/observability/index.ts";
import type { TelemetryExporterFanout } from "../../src/observability/telemetry-exporter.types.js";

const log = (index: number) => ({
  version: 2 as const,
  signal: "log" as const,
  timestamp: "2026-09-02T00:00:00.000Z",
  level: "info" as const,
  component: "test",
  message: `record ${index}`,
  fields: {},
});

test("a fan-out without exporters starts no export queue and counts no failures", async () => {
  const exporter = await createTelemetryExporterFanout({ modules: [] });
  const runtime = await createObservabilityRuntime({ exporter });
  // Far more than the export queue holds, admitted in one synchronous burst.
  for (let index = 0; index < 5_000; index++) runtime.collect(log(index));
  await runtime.flush();
  expect(runtime.exportCounters()).toMatchObject({
    exportFailures: 0,
    exportCapacityRejections: 0,
  });
  await runtime.close();
});

test("the remote runtime also ignores a fan-out without exporters", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({}) })),
  );
  try {
    const exporter = await createTelemetryExporterFanout({ modules: [] });
    const runtime = await createObservabilityRuntime({
      remote: { url: "https://telemetry.example.test", token: "test-token" },
      exporter,
    });
    for (let index = 0; index < 5_000; index++) runtime.collect(log(index));
    await runtime.flush();
    expect(runtime.exportCounters()).toMatchObject({
      exportFailures: 0,
      exportCapacityRejections: 0,
    });
    await runtime.close();
  } finally {
    vi.unstubAllGlobals();
  }
});

test("export failures and capacity rejections of a configured exporter are counted apart", async () => {
  let calls = 0;
  const exporter: TelemetryExporterFanout = {
    exportRecord: async () => {
      calls += 1;
      if (calls % 2 === 0) throw new Error("exporter rejected the record");
    },
    flush: async () => undefined,
    close: async () => undefined,
    stats: () => [lane()],
    setFailureHandler: () => undefined,
  };
  const runtime = await createObservabilityRuntime({ exporter });
  for (let index = 0; index < 5_000; index++) runtime.collect(log(index));
  await expect(runtime.flush()).rejects.toThrow();
  const counters = runtime.exportCounters();
  expect(counters.exportFailures).toBe(Math.floor(calls / 2));
  expect(counters.exportCapacityRejections).toBeGreaterThan(0);
  expect(calls + (counters.exportCapacityRejections ?? 0)).toBe(counters.exportSelected);
  await runtime.close().catch(() => undefined);
});

/** A healthy lane status for a test fan-out that does export. */
function lane() {
  return {
    name: "test",
    integrationId: "test",
    adapterId: "test",
    healthy: true,
    received: 0,
    selected: 0,
    exported: 0,
    sampledOut: 0,
    severityFiltered: 0,
    failures: 0,
    queuedRecords: 0,
    queuedUnits: 0,
    droppedRecords: 0,
    droppedUnits: 0,
  };
}
