/**
 * `relkit build --target vercel` refuses local durable state and stale cron entries before it
 * stages anything, and the parser pins the target to the Node server.
 */
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { vercelBuildErrors } from "../src/commands/build-vercel-guard.js";
import { vercelConfig } from "../src/commands/deploy-init-vercel.js";
import { vercelCronPlan } from "../src/commands/deploy-init-vercel-crons.js";
import { parseProjectArgs } from "../src/commands/project-args.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/**
 * Builds a graph with one scheduled job on the given provider.
 * @param integrationId - Jobs provider integration.
 * @param cron - The job's schedule.
 * @returns Graph JSON.
 */
function graph(integrationId: string, cron = "*/5 * * * *"): string {
  return JSON.stringify({
    nodes: [
      { kind: "provider", capability: "job", profile: "default", adapter: { integrationId } },
      { kind: "job", id: "reports.sweep", profile: "default", schedules: [{ id: "sweep", cron }] },
    ],
  });
}

/**
 * Creates a project root, optionally with `vercel.json`.
 * @param config - `vercel.json` content.
 * @returns The root.
 */
async function project(config?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-vercel-guard-"));
  roots.push(root);
  if (config !== undefined) await writeFile(join(root, "vercel.json"), config);
  return root;
}

const errors = (root: string, graphText: string) =>
  Effect.runPromise(vercelBuildErrors(root, graphText)).then((found) =>
    found.map((diagnostic) => diagnostic.code),
  );

test("a current vercel.json and an external backend pass", async () => {
  const text = graph("postgres");
  expect(await errors(await project(vercelConfig(vercelCronPlan(text))), text)).toEqual([]);
});

test("the local provider is refused", async () => {
  const text = graph("local");
  expect(await errors(await project(vercelConfig(vercelCronPlan(text))), text)).toEqual([
    "RELKIT_VERCEL_LOCAL_DURABLE_STATE",
  ]);
});

test("missing or stale cron entries are refused", async () => {
  const text = graph("postgres");
  expect(await errors(await project(), text)).toEqual(["RELKIT_VERCEL_CRONS_OUT_OF_DATE"]);
  const stale = vercelConfig(vercelCronPlan(graph("postgres", "0 * * * *")));
  expect(await errors(await project(stale), text)).toEqual(["RELKIT_VERCEL_CRONS_OUT_OF_DATE"]);
});

test("--target vercel selects the Node server and refuses Bun", () => {
  expect(parseProjectArgs(["--target", "vercel"], "build")).toMatchObject({
    target: "vercel",
    runtime: "node",
  });
  expect(() => parseProjectArgs(["--target", "vercel", "--runtime", "bun"], "build")).toThrow(
    "--target vercel builds the Node server",
  );
  expect(() => parseProjectArgs(["--target", "railway"], "build")).toThrow(
    "--target must be vercel.",
  );
  expect(() => parseProjectArgs(["--target", "vercel"], "check")).toThrow(
    "Unknown check option: --target",
  );
});
