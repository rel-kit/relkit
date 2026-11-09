/**
 * The Bun and Node runtime adapters pass the published runtime suite inside their own runtime:
 * the fixture runs under `bun` and under `node` (Node 22.13 or later) and prints its report. The
 * Workers adapter runs the same suite inside workerd in `@relkit/cloudflare`'s
 * `workers-conformance.test.ts`.
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";
import type { ConformanceReport } from "../../src/conformance.types.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/runtime-adapter.mjs", import.meta.url));
const root = await mkdtemp(join(tmpdir(), "relkit-runtime-conformance-"));
afterAll(() => rm(root, { recursive: true, force: true }));

test.each(["bun", "node"])("the %s adapter passes the runtime suite", (executable) => {
  const result = spawnSync(executable, [FIXTURE], {
    encoding: "utf8",
    env: { ...process.env, RELKIT_FIXTURE_ROOT: root, RELKIT_FIXTURE_MARKER: "marker" },
    timeout: 60_000,
  });
  expect(result.status, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout) as ConformanceReport;
  expect(report.results.map((item) => [item.id, item.outcome, item.error])).toEqual(
    report.results.map((item) => [item.id, "pass", undefined]),
  );
});
