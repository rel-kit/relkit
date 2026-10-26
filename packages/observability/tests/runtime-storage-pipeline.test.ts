/** Explicit storage preserves commit-before-export, query and redaction behavior. */
import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { traceIsSampled } from "../src/index.ts";
import { createPipelineFixture, collectPipelineRecords } from "./runtime-storage-fixture.js";
test("persists and streams captured records before root-consistent export sampling", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-telemetry-pipeline-"));
  try {
    const { runtime, exported, status } = await createPipelineFixture(root);
    collectPipelineRecords(runtime);

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
    expect(status.persistedBeforeExport).toBe(true);
    expect(JSON.stringify(runtime.readRecords())).not.toContain("secret-tenant");
    await runtime.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
