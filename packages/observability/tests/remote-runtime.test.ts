import { expect, test, vi } from "vitest";
import { createObservabilityRuntime } from "../src/index.ts";
test("remote runtime persists a record and releases resources after flush failure", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  vi.stubGlobal("fetch", fetchMock);
  const failure = new Error("exporter flush failed");
  let exporterCloses = 0;
  try {
    const runtime = await createObservabilityRuntime({
      remote: { url: "https://telemetry.example.test", token: "test-token" },
      exporter: {
        exportRecord: () => undefined,
        flush: async () => {
          throw failure;
        },
        close: async () => {
          exporterCloses += 1;
        },
        stats: () => [],
        setFailureHandler: () => undefined,
      },
    });
    const log = {
      version: 2 as const,
      signal: "log" as const,
      timestamp: "2026-09-02T00:00:00.000Z",
      level: "info" as const,
      component: "test",
      message: "safe",
      fields: {},
    };
    runtime.collect(log);
    await expect(runtime.close()).rejects.toBe(failure);
    await expect(runtime.close()).rejects.toBe(failure);
    expect(exporterCloses).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://telemetry.example.test/records",
      expect.objectContaining({ method: "POST" }),
    );
    expect(() => runtime.stream.publish("log.emitted", log)).toThrow("Stream is closed");
  } finally {
    vi.unstubAllGlobals();
  }
});
test("remote runtime retains an asynchronous export failure until flush", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({}) })),
  );
  const failure = new Error("export rejected");
  let closes = 0;
  try {
    const runtime = await createObservabilityRuntime({
      remote: { url: "https://telemetry.example.test", token: "test-token" },
      exporter: {
        exportRecord: async () => {
          throw failure;
        },
        flush: async () => undefined,
        close: async () => {
          closes++;
        },
        stats: () => [],
        setFailureHandler: () => undefined,
      },
    });
    runtime.collect({
      version: 2,
      signal: "log",
      timestamp: "2026-09-02T00:00:00.000Z",
      level: "info",
      component: "test",
      message: "safe",
      fields: {},
    });
    await expect(runtime.flush()).rejects.toBe(failure);
    expect(runtime.exportCounters().exportFailures).toBe(1);
    await expect(runtime.close()).rejects.toBe(failure);
    expect(closes).toBe(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
