/**
 * The Railway, Vercel and Cloudflare targets of `relkit deploy init` pass the published
 * deploy-target suite. Vercel and Cloudflare read a graph with a schedule, a cache, a bucket,
 * realtime and durable jobs; Railway reads none, so its `graph-required` case is skipped.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { DEPLOY_TARGETS } from "@relkit/cli/deploy-targets";
import { runConformance } from "../../src/conformance.js";
import { createDeployTargetConformanceHarness } from "../../src/deploy-target-conformance.js";

const root = await mkdtemp(join(tmpdir(), "relkit-deploy-target-conformance-"));
await writeFile(join(root, "package.json"), JSON.stringify({ name: "conformance-app" }));
afterAll(() => rm(root, { recursive: true, force: true }));

/**
 * One provider node of the graph.
 * @param capability - Capability and profile name. @param adapterId - Adapter id.
 * @param behavior - Adapter behavior.
 * @returns The node.
 */
const provider = (capability: string, adapterId: string, behavior: object) => ({
  kind: "provider",
  capability,
  profile: capability,
  adapter: { adapterId, integrationId: adapterId.split("-")[0], behavior },
});

const GRAPH = {
  nodes: [
    provider("cache", "cloudflare-kv-binding", { binding: "CACHE", minimumTtlMs: 60_000 }),
    provider("bucket", "cloudflare-r2-binding", { binding: "UPLOADS" }),
    provider("realtime", "cloudflare-durable-object-realtime", { binding: "RELKIT_REALTIME" }),
    provider("job", "postgres-job", { native: {} }),
    { kind: "cache", id: "orders.prices", profile: "cache" },
    { kind: "bucket", id: "orders.uploads", profile: "bucket" },
    { kind: "channel", id: "orders.feed", profile: "realtime", client: "public" },
    {
      kind: "job",
      id: "orders.sweep",
      profile: "job",
      schedules: [{ id: "n", cron: "0 3 * * *" }],
    },
  ],
};

test.each(DEPLOY_TARGETS.map((target) => [target.id, target] as const))(
  "%s passes the deploy-target suite",
  async (_id, target) => {
    const report = await runConformance(
      createDeployTargetConformanceHarness({ target, root, graph: GRAPH }),
    );
    expect(report.results.filter((result) => result.outcome === "fail")).toEqual([]);
    const skipped = report.results.filter((result) => result.outcome === "skip");
    expect(skipped.map((result) => result.id)).toEqual(target.needsGraph ? [] : ["graph-required"]);
  },
);

test("the targets are the ones relkit deploy init accepts", () => {
  expect(DEPLOY_TARGETS.map((target) => [target.id, target.runtimes])).toEqual([
    ["railway", ["bun", "node"]],
    ["vercel", ["node"]],
    ["cloudflare", ["workers"]],
  ]);
});
