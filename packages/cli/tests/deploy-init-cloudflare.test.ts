/**
 * `relkit deploy init cloudflare` writes `wrangler.jsonc`, the Worker entry and a GitHub Actions
 * workflow, compared byte for byte with the committed snapshots under `fixtures/deploy-init-cloudflare`.
 * The bindings come from the compiled graph: KV and R2 binding providers, Durable Object realtime,
 * and a work queue plus a Cron Trigger when jobs or events use the Postgres backend. It runs through
 * the real CLI parser and never reaches Cloudflare. Set `RELKIT_UPDATE_SNAPSHOTS=1` to rewrite the
 * snapshots after an intended change.
 */
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCli } from "../src/main.js";
import { cloudflareFiles, cloudflarePlan } from "../src/commands/deploy-init-cloudflare.js";

const roots: string[] = [];
const snapshots = join(import.meta.dir, "fixtures", "deploy-init-cloudflare");

/**
 * A provider node.
 * @param capability - Provider capability.
 * @param adapterId - Adapter.
 * @param integrationId - Integration.
 * @param behavior - Behavior value.
 * @returns The node.
 */
function provider(
  capability: string,
  adapterId: string,
  integrationId: string,
  behavior: object = {},
) {
  return {
    kind: "provider",
    capability,
    profile: capability,
    adapter: { adapterId, integrationId, behavior },
  };
}

/** A graph that uses every binding the generator derives. */
const GRAPH = JSON.stringify({
  nodes: [
    provider("cache", "cloudflare-kv-binding", "cloudflare", {
      binding: "CACHE",
      minimumTtlMs: 60_000,
    }),
    provider("bucket", "cloudflare-r2-binding", "cloudflare", { binding: "UPLOADS" }),
    provider("realtime", "cloudflare-durable-object-realtime", "cloudflare", {
      binding: "RELKIT_REALTIME",
    }),
    provider("job", "postgres-job", "postgres", { native: {} }),
    { kind: "cache", id: "orders.prices", profile: "cache" },
    { kind: "bucket", id: "orders.uploads", profile: "bucket" },
    { kind: "channel", id: "orders.feed", profile: "realtime", client: "public" },
    {
      kind: "job",
      id: "orders.sweep",
      profile: "job",
      schedules: [{ id: "nightly", cron: "0 3 * * *" }],
    },
  ],
});

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/**
 * Runs the CLI in JSON mode inside a project directory.
 * @param args - CLI arguments after `--json`.
 * @param root - Project root.
 * @returns Exit code and the joined output.
 */
async function cli(args: readonly string[], root: string) {
  const lines: string[] = [];
  const code = await runCli(["--json", ...args], {
    cwd: root,
    installSignalHandlers: false,
    io: { stdout: (line) => lines.push(line), stderr: (line) => lines.push(line) },
  });
  return { code, output: lines.join("\n") };
}

/**
 * Creates a project, with the compiled graph unless told otherwise.
 * @param graph - Graph text, or null for a project that was never checked.
 * @returns The project root.
 */
async function project(graph: string | null = GRAPH): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-deploy-init-cloudflare-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), '{ "name": "@acme/My_App" }\n');
  if (graph !== null) {
    await mkdir(join(root, ".relkit", "generated"), { recursive: true });
    await writeFile(join(root, ".relkit", "generated", "application.graph.json"), graph);
  }
  return root;
}

test("writes the Cloudflare files matching the snapshots", async () => {
  const root = await project();
  const result = await cli(["deploy", "init", "cloudflare", "--project-root", root], root);
  expect(result.code, result.output).toBe(0);
  for (const file of cloudflareFiles(cloudflarePlan(GRAPH, "@acme/My_App"))) {
    const written = await readFile(join(root, file.path), "utf8");
    const snapshot = join(snapshots, file.path);
    if (process.env.RELKIT_UPDATE_SNAPSHOTS === "1") {
      await mkdir(dirname(snapshot), { recursive: true });
      await writeFile(snapshot, written);
    }
    expect(written).toBe(await readFile(snapshot, "utf8"));
  }
  expect(result.output).toContain('"status":"created"');
  expect(result.output).toContain('"cloudResourcesChanged":false');
  expect(result.output).toContain('"runtime":"workers"');
  expect(result.output).toContain("queues create my-app-relkit-work");
});

test("derives bindings from the graph and adds the queue only for durable work", () => {
  expect(cloudflarePlan(GRAPH, "@acme/My_App")).toEqual({
    name: "my-app",
    kv: ["CACHE"],
    r2: ["UPLOADS"],
    realtime: ["RELKIT_REALTIME"],
    durableWork: true,
  });
  const http = cloudflarePlan(JSON.stringify({ nodes: [] }), undefined);
  expect(http).toEqual({ name: "relkit-app", kv: [], r2: [], realtime: [], durableWork: false });
  const [config, entry, workflow] = cloudflareFiles(http).map((file) => file.content);
  expect(config).not.toContain("queues");
  expect(config).not.toContain("triggers");
  expect(config).not.toContain("durable_objects");
  expect(entry).toContain('export { default } from "./.relkit/build/server/index.js";');
  expect(workflow).not.toContain("queues create");
});

test("keeps identical files, refuses differing ones and replaces them with --force", async () => {
  const root = await project();
  const init = ["deploy", "init", "cloudflare", "--project-root", root];
  expect((await cli(init, root)).code).toBe(0);
  const again = await cli(init, root);
  expect(again.code).toBe(0);
  expect(again.output).not.toContain('"status":"created"');

  await writeFile(join(root, "wrangler.jsonc"), "{}\n");
  const conflict = await cli(init, root);
  expect(conflict.code).not.toBe(0);
  expect(conflict.output).toContain("RELKIT_DEPLOY_INIT_CONFLICT");
  expect(await readFile(join(root, "wrangler.jsonc"), "utf8")).toBe("{}\n");

  const forced = await cli([...init, "--force"], root);
  expect(forced.code).toBe(0);
  expect(forced.output).toContain('"status":"replaced"');
  expect(await readFile(join(root, "wrangler.jsonc"), "utf8")).toContain("nodejs_compat");
});

test("needs the compiled graph and runs only the Workers bundle", async () => {
  const unchecked = await project(null);
  const missing = await cli(
    ["deploy", "init", "cloudflare", "--project-root", unchecked],
    unchecked,
  );
  expect(missing.code).not.toBe(0);
  expect(missing.output).toContain("run relkit check first");

  const root = await project();
  const workers = await cli(
    ["deploy", "init", "cloudflare", "--runtime", "workers", "--project-root", root],
    root,
  );
  expect(workers.code, workers.output).toBe(0);
  const node = await cli(
    ["deploy", "init", "cloudflare", "--runtime", "node", "--project-root", root],
    root,
  );
  expect(node.code).not.toBe(0);
  expect(node.output).toContain("--runtime workers");
});
