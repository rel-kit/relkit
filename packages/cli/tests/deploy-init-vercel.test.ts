/**
 * `relkit deploy init vercel` writes `vercel.json`, the Node function entry and a GitHub Actions
 * workflow, compared byte for byte with the committed snapshots under `fixtures/deploy-init-vercel`.
 * The cron entries come from the schedules in the compiled graph: a UTC cron is copied, a timezone
 * or interval schedule falls back to every minute, and equal expressions share one entry. It runs
 * through the real CLI parser and never reaches Vercel. Set `RELKIT_UPDATE_SNAPSHOTS=1` to rewrite
 * the snapshots after an intended change.
 */
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCli } from "../src/main.js";
import { vercelFiles } from "../src/commands/deploy-init-vercel.js";
import { vercelCronPlan } from "../src/commands/deploy-init-vercel-crons.js";

const roots: string[] = [];
const snapshots = join(import.meta.dir, "fixtures", "deploy-init-vercel");

/** A graph with every kind of schedule timing the derivation distinguishes. */
const GRAPH = JSON.stringify({
  nodes: [
    {
      kind: "job",
      id: "reports.nightly",
      schedules: [{ id: "nightly", cron: "0 3 * * *", timezone: "UTC" }],
    },
    {
      kind: "job",
      id: "billing.sweep",
      schedules: [
        { id: "local", cron: "30 9 * * 1-5", timezone: "Europe/Berlin" },
        { id: "often", every: "5 minutes" },
      ],
    },
    { kind: "job", id: "mail.digest", schedules: [{ id: "nightly", cron: "0  3 * * *" }] },
    { kind: "function", id: "orders.create" },
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
  const root = await mkdtemp(join(tmpdir(), "relkit-deploy-init-vercel-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), '{ "name": "my-app" }\n');
  if (graph !== null) {
    await mkdir(join(root, ".relkit", "generated"), { recursive: true });
    await writeFile(join(root, ".relkit", "generated", "application.graph.json"), graph);
  }
  return root;
}

test("writes the Vercel files matching the snapshots", async () => {
  const root = await project();
  const result = await cli(["deploy", "init", "vercel", "--project-root", root], root);
  expect(result.code, result.output).toBe(0);
  for (const file of vercelFiles(vercelCronPlan(GRAPH))) {
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
  expect(result.output).toContain('"runtime":"node"');
  expect(result.output).toContain("billing.sweep/local (timezone Europe/Berlin)");
  expect(result.output).toContain("billing.sweep/often (an interval schedule)");
});

test("derives one cron entry per distinct expression", () => {
  expect(vercelCronPlan(GRAPH).crons).toEqual([
    { path: "/_relkit/v1/vercel/cron/billing.sweep/local", schedule: "* * * * *" },
    { path: "/_relkit/v1/vercel/cron/mail.digest/nightly", schedule: "0 3 * * *" },
  ]);
  expect(vercelCronPlan(JSON.stringify({ nodes: [] }))).toEqual({ crons: [], fallbacks: [] });
});

test("keeps identical files, refuses differing ones and replaces them with --force", async () => {
  const root = await project();
  const init = ["deploy", "init", "vercel", "--project-root", root];
  expect((await cli(init, root)).code).toBe(0);
  const again = await cli(init, root);
  expect(again.code).toBe(0);
  expect(again.output).not.toContain('"status":"created"');

  await writeFile(join(root, "vercel.json"), "{}\n");
  const conflict = await cli(init, root);
  expect(conflict.code).not.toBe(0);
  expect(conflict.output).toContain("RELKIT_DEPLOY_INIT_CONFLICT");
  expect(await readFile(join(root, "vercel.json"), "utf8")).toBe("{}\n");

  const forced = await cli([...init, "--force"], root);
  expect(forced.code).toBe(0);
  expect(forced.output).toContain('"status":"replaced"');
  expect(await readFile(join(root, "vercel.json"), "utf8")).toContain("--target vercel");
});

test("needs the compiled graph and runs only the Node server", async () => {
  const unchecked = await project(null);
  const missing = await cli(["deploy", "init", "vercel", "--project-root", unchecked], unchecked);
  expect(missing.code).not.toBe(0);
  expect(missing.output).toContain("run relkit check first");

  const root = await project();
  const bun = await cli(
    ["deploy", "init", "vercel", "--runtime", "bun", "--project-root", root],
    root,
  );
  expect(bun.code).not.toBe(0);
  expect(bun.output).toContain("--runtime node");
});
