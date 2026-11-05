/**
 * Production builds warn when jobs, schedules or events use the local
 * filesystem provider. The pure check is exercised on compiled graphs, and
 * `buildProject` is driven through its injected check so the warning reaches
 * the build result's diagnostics without failing the build on its own.
 */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProject } from "../src/commands/build.js";
import {
  LOCAL_DURABLE_PROVIDER_CODE,
  localDurableProviderWarnings,
} from "../src/commands/build-durable-warnings.js";
import type { CheckResult } from "../src/commands/check-result.types.js";

const source = { file: "relkit.config.ts", line: 12, column: 3 };

function graph(integrationId: string): string {
  return JSON.stringify({
    nodes: [
      {
        kind: "provider",
        capability: "job",
        profile: "default",
        adapter: { integrationId },
        source,
      },
      {
        kind: "provider",
        capability: "event",
        profile: "default",
        adapter: { integrationId },
        source,
      },
      { kind: "job", id: "job.orders.cleanup", profile: "default", schedules: [{ id: "daily" }] },
      { kind: "job", id: "job.orders.export", profile: "default", schedules: null },
      { kind: "event", id: "orders.placed", profile: "default" },
    ],
  });
}

test("warns once per used local jobs or events profile", () => {
  const warnings = localDurableProviderWarnings(graph("local"));
  expect(warnings).toHaveLength(2);
  expect(warnings[0]).toMatchObject({
    code: LOCAL_DURABLE_PROVIDER_CODE,
    severity: "warning",
    message: expect.stringContaining("2 jobs and 1 schedule use the local filesystem provider"),
  });
  expect(warnings[1]?.message).toContain("Events use the local filesystem provider");
  expect(JSON.stringify(warnings[0])).toContain("relkit.config.ts");
});

test("durable providers and unused local profiles do not warn", () => {
  expect(localDurableProviderWarnings(graph("postgres"))).toEqual([]);
  const unused = JSON.stringify({
    nodes: [
      {
        kind: "provider",
        capability: "job",
        profile: "spare",
        adapter: { integrationId: "local" },
      },
    ],
  });
  expect(localDurableProviderWarnings(unused)).toEqual([]);
});

test("the production build result carries the warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-build-warning-"));
  try {
    const result = await buildProject({
      projectRoot: root,
      check: async () =>
        ({
          ok: true,
          activatable: true,
          projectRoot: root,
          generatedDirectory: join(root, ".relkit/generated"),
          graphHash: `sha256:${"a".repeat(64)}`,
          diagnostics: [],
          outputs: { graph: graph("local") },
        }) as unknown as CheckResult,
    });
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain(LOCAL_DURABLE_PROVIDER_CODE);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
