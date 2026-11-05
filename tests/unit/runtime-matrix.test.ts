/**
 * Pull requests run the runtime HTTP suite on Bun and Node LTS, and the CI Gate, the required
 * check, fails when any of those legs fails. The gate's own shell step runs here with job results
 * as GitHub passes them, so a failing Node leg is shown to block the merge without merging.
 */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

interface WorkflowStep {
  readonly name?: string;
  readonly run?: string;
}
interface WorkflowJob {
  readonly needs?: string | readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly steps?: readonly WorkflowStep[];
  readonly strategy?: { readonly matrix?: Readonly<Record<string, unknown>> };
}

async function workflow(name: string): Promise<Readonly<Record<string, WorkflowJob>>> {
  const text = await readFile(resolve(root, ".github/workflows", name), "utf8");
  return (Bun.YAML.parse(text) as { jobs: Record<string, WorkflowJob> }).jobs;
}

test("pull requests run the api template's HTTP suite on Bun, Node 22 and Node 24", async () => {
  const job = (await workflow("checks.yml"))["runtime-http"]!;
  expect(job.strategy?.matrix?.runtime).toEqual([
    { name: "Bun 1.3.10", kind: "bun", node: "24" },
    { name: "Node 22", kind: "node", node: "22" },
    { name: "Node 24", kind: "node", node: "24" },
  ]);
  const runs = (job.steps ?? []).map((step) => step.run ?? "").join("\n");
  expect(runs).toContain(
    'bun scripts/runtime-http-suite.ts --runtime "${{ matrix.runtime.kind }}"',
  );
  expect(runs).toContain("packages/relkit/tests/runtime/vitest.config.ts");
  expect(runs).toContain("integrations/packages/redis/tests/runtime-conformance.test.ts");
});

test("a failing Node leg fails the CI Gate", async () => {
  const gate = (await workflow("checks.yml"))["ci-gate"]!;
  expect(gate.needs).toContain("runtime-http");
  expect(gate.env?.RUNTIME_HTTP_RESULT).toBe("${{ needs.runtime-http.result }}");
  const script = gate.steps?.find((step) => step.name === "Require fast safety jobs")?.run;
  expect(script).toContain('test "$RUNTIME_HTTP_RESULT" = success');
  const results = Object.fromEntries(
    Object.keys(gate.env ?? {}).map((name) => [name, "success"] as const),
  );
  const run = (overrides: Record<string, string>) =>
    Bun.spawnSync(["bash", "-e", "-c", script!], {
      env: { PATH: process.env.PATH ?? "", ...results, ...overrides },
    }).exitCode;
  expect(run({})).toBe(0);
  // GitHub reports a matrix job as failed when any leg fails, such as Node 22 alone.
  expect(run({ RUNTIME_HTTP_RESULT: "failure" })).not.toBe(0);
  expect(run({ RUNTIME_HTTP_RESULT: "cancelled" })).not.toBe(0);
  expect(run({ RUNTIME_HTTP_RESULT: "skipped" })).not.toBe(0);
});

test("the nightly creation canary also serves every template on Node 22 and 24", async () => {
  const jobs = await workflow("creation-canary.yml");
  const node = jobs["node-canary"]!;
  expect(node.strategy?.matrix).toEqual({
    template: ["minimal", "api", "agent", "fullstack", "tasks"],
    node: ["22", "24"],
  });
  const runs = (node.steps ?? []).map((step) => step.run ?? "").join("\n");
  expect(runs).toContain("relkit build --runtime node");
  expect(runs).toContain("node .relkit/build/server/index.js");
  expect(runs).toContain("gh issue create");
  expect(jobs.canary?.strategy?.matrix?.template).toEqual(node.strategy?.matrix?.template);
});
