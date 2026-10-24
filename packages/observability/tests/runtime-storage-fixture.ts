/** Real segment-backed injection fixture; application defaults remain memory-only. */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createObservabilityRuntime,
  createObservabilityIndex,
  createObservabilitySegmentStore,
  createObservabilityQuery,
} from "../src/index.ts";
import type { ObservabilityRuntimeEffects } from "../src/runtime-effect.types.js";
/** @param root - Test-owned history root. @returns Owned real segment storage for explicit injection. */
async function segmentStorage(root: string) {
  const index = await createObservabilityIndex({ root });
  const store = await createObservabilitySegmentStore({ root, index });
  return {
    append: store.append,
    query: createObservabilityQuery(index),
    flush: async () => {
      await store.flush();
      await index.flush();
    },
    close: async () => {
      try {
        await store.close();
      } finally {
        await index.close();
      }
    },
  };
}
/** @param root - Test-owned history directory. @returns Runtime and observable export ordering evidence. */
export async function createPipelineFixture(root: string) {
  const exported: string[] = [];
  const status = { persistedBeforeExport: false };
  const runtime = await createObservabilityRuntime({
    root,
    storage: await segmentStorage(root),
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
      status.persistedBeforeExport = (await readFile(join(directory, files[0]!), "utf8")).includes(
        '"message":"kept locally"',
      );
    },
  });
  return { runtime, exported, status };
}
/** @param runtime - Actual runtime under test. @returns Nothing after captured/filtered fixture records are submitted. */
export function collectPipelineRecords(runtime: ObservabilityRuntimeEffects): void {
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
}
