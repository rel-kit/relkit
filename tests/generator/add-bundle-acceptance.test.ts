/** Verifies grouped scaffolding through installed public creation/addition APIs. */
import { expect, test } from "bun:test";
import { join } from "node:path";
import { checkProject } from "../../packages/cli/src/commands/check.ts";
import { createRegistrationPlan, type ApplicationGraph } from "../../packages/graph/src/index.ts";
import {
  ADD_FAILURE_CODES,
  normalizeAddRequest,
  planAdd,
} from "../../packages/create-relkit/src/index.ts";
import { project, add, linkDependencies, releaseVersion } from "./add-acceptance-fixture.js";
import { bundleEdges } from "./add-acceptance-cases.js";
import { registerAddCleanup } from "./add-acceptance-fixture.js";

registerAddCleanup();

test("the full bundle compiles in every starter and preserves its graph relationships", async () => {
  for (const template of ["minimal", "api", "agent", "fullstack"] as const) {
    const root = await project(template);
    await add(root, ["service", "Billing", "--full", "--no-install"]);
    await linkDependencies(root);
    const result = await checkProject({ projectRoot: root });
    expect(result.diagnostics).toEqual([]);
    const graph = JSON.parse(result.outputs.graph) as ApplicationGraph;
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        kind: "error",
        id: "billing.example-error",
        data: expect.objectContaining({ type: "object" }),
      }),
    );
    const plan = createRegistrationPlan(graph);
    expect(plan.queues).toEqual([]);
    expect(plan.tasks).toContainEqual(expect.objectContaining({ id: "task.billing.example-task" }));
    expect(plan.jobs).toContainEqual(
      expect.objectContaining({
        id: "job.billing.example-job",
        executionModel: "task",
        jobId: "billing.example-job",
        taskId: "billing.example-task",
      }),
    );
    expect(graph.edges).toEqual(expect.arrayContaining(bundleEdges));
  }
}, 30_000);

test("API starter integration tests run after adding a full service without Docker", async () => {
  const root = await project("api");
  await add(root, ["service", "Billing", "--full", "--no-install"]);
  await linkDependencies(root);
  expect((await checkProject({ projectRoot: root })).diagnostics).toEqual([]);
  const child = Bun.spawn([process.execPath, "test", "tests/integration"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, output, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, output, error }).toMatchObject({ code: 0 });
}, 30_000);
