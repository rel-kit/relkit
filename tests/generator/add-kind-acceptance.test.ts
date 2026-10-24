/** Verifies grouped scaffolding through installed public creation/addition APIs. */
import { expect } from "bun:test";
import { join } from "node:path";
import { checkProject } from "../../packages/cli/src/commands/check.ts";
import { createRegistrationPlan, type ApplicationGraph } from "../../packages/graph/src/index.ts";
import {
  ADD_FAILURE_CODES,
  normalizeAddRequest,
  planAdd,
} from "../../packages/cli/src/scaffolding/index.ts";
import { project, add, linkDependencies, releaseVersion } from "./add-acceptance-fixture.js";
import { standaloneRequests } from "./add-acceptance-cases.js";
import { registerAddCleanup, addTest as test } from "./add-acceptance-fixture.js";

registerAddCleanup();

test("every standalone add kind compiles in every starter", async () => {
  for (const template of ["minimal", "api", "agent", "fullstack"] as const) {
    const root = await project(template);
    for (const args of standaloneRequests) await add(root, [...args, "--no-install"]);
    await linkDependencies(root);
    const result = await checkProject({ projectRoot: root });
    expect(result.diagnostics).toEqual([]);
    const graph = JSON.parse(result.outputs.graph) as ApplicationGraph;
    for (const domain of ["hello", "toolbox"]) {
      expect(graph.edges).toContainEqual({
        from: `${domain}.find-order`,
        kind: "exposes-as-tool",
        to: `${domain}.find-order-tool`,
      });
    }
  }
}, 30_000);
