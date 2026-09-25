import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { createObservabilityRuntime } from "../src/index.ts";

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
