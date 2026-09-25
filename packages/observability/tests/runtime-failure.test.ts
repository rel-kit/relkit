import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { createObservabilityRuntime } from "../src/runtime.js";
import { admitted } from "./telemetry-exporter-fixtures.js";

test("a settled export failure remains observable through flush and close", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-observability-failure-"));
  let started!: () => void;
  const exporting = new Promise<void>((resolve) => {
    started = resolve;
  });
  try {
    const runtime = await createObservabilityRuntime({
      root,
      exportRecord: async () => {
        started();
        throw new Error("export failed");
      },
    });
    runtime.collect(admitted());
    await exporting;
    await Promise.resolve();
    await expect(runtime.flush()).rejects.toThrow("export failed");
    await expect(runtime.close()).rejects.toThrow("export failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
