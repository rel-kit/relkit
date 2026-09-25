import { expect, test, vi } from "vitest";
import { createTelemetryExporterFanout } from "../src/telemetry-exporters.js";
import { admitted, exporter, runtimeModule, sink } from "./telemetry-exporter-fixtures.js";
test("failure notifications remain bounded until a handler is installed", async () => {
  const fanout = await createTelemetryExporterFanout({
    exporters: { failing: exporter("failing") },
    modules: [
      runtimeModule("failing", () =>
        sink(() => {
          throw new Error("failed");
        }),
      ),
    ],
    values: { EXPORT_TOKEN: "resolved-token" },
  });
  for (let i = 0; i < 300; i++) fanout.exportRecord(admitted(), "export");
  await fanout.flush();
  const failures: unknown[] = [];
  fanout.setFailureHandler((failure) => failures.push(failure));
  expect(failures).toHaveLength(128);
  expect(fanout.stats()[0]).toMatchObject({ failures: 300, droppedRecords: 0 });
  await fanout.close();
});
test("repeated close releases a lane once and drops later export requests", async () => {
  let closes = 0;
  const fanout = await createTelemetryExporterFanout({
    exporters: { single: exporter("single") },
    modules: [
      runtimeModule("single", () => ({
        exportRecord: async () => undefined,
        close: async () => {
          closes++;
        },
      })),
    ],
    values: { EXPORT_TOKEN: "resolved-token" },
  });
  await Promise.all([fanout.close(), fanout.close()]);
  fanout.exportRecord(admitted(), "export");
  expect(closes).toBe(1);
  expect(fanout.stats()[0]).toMatchObject({ received: 1, droppedRecords: 1 });
});
test("bounds independent exporter acquisition and preserves sorted lane order", async () => {
  let active = 0;
  let peak = 0;
  let started = 0;
  const releases: Array<() => void> = [];
  const names = Array.from({ length: 40 }, (_, index) => `lane-${String(index).padStart(2, "0")}`);
  const exporters = Object.fromEntries(names.map((name) => [name, exporter(name)]));
  const modules = names.map((name) => ({
    module: {
      ...runtimeModule(name, () => sink(() => undefined)).module,
      createTelemetryExporter: () => {
        active++;
        started++;
        peak = Math.max(peak, active);
        return new Promise((resolve) =>
          releases.push(() => {
            active--;
            resolve(sink(() => undefined));
          }),
        );
      },
    },
  }));
  const pending = createTelemetryExporterFanout({
    exporters,
    modules,
    values: { EXPORT_TOKEN: "resolved-token" },
  });
  for (let wave = 0; wave < 3; wave++) {
    await vi.waitFor(() => expect(started).toBe(Math.min((wave + 1) * 16, 40)));
    expect(peak).toBeLessThanOrEqual(16);
    for (const release of releases.splice(0)) release();
  }
  const fanout = await pending;
  expect(fanout.stats().map(({ name }) => name)).toEqual(names);
  await fanout.close();
});
test("bounds exporter flush callbacks across all lanes", async () => {
  let active = 0;
  let started = 0;
  let peak = 0;
  let hold = true;
  const releases: Array<() => void> = [];
  const names = Array.from({ length: 40 }, (_, index) => `flush-${String(index).padStart(2, "0")}`);
  const fanout = await createTelemetryExporterFanout({
    exporters: Object.fromEntries(names.map((name) => [name, exporter(name)])),
    modules: names.map((name) =>
      runtimeModule(name, () => ({
        exportRecord: () => undefined,
        flush: () => {
          if (!hold) return Promise.resolve();
          active++;
          started++;
          peak = Math.max(peak, active);
          return new Promise<void>((resolve) =>
            releases.push(() => {
              active--;
              resolve();
            }),
          );
        },
      })),
    ),
    values: { EXPORT_TOKEN: "resolved-token" },
  });
  const pending = fanout.flush();
  for (let wave = 0; wave < 3; wave++) {
    await vi.waitFor(() => expect(started).toBe(Math.min((wave + 1) * 16, 40)));
    expect(peak).toBeLessThanOrEqual(16);
    for (const release of releases.splice(0)) release();
  }
  await pending;
  hold = false;
  await fanout.close();
});
