import { expect, test } from "bun:test";
import { GRAPH_VERSION } from "../../packages/contracts/src/index.ts";
import type { ApplicationGraph } from "../../packages/graph/src/index.ts";
import {
  generateClientRegistry,
  generateContract,
  publicFingerprint,
} from "../../packages/client-generator/src/index.ts";

test("generates name-based job dot access without exposing private jobs", () => {
  const graph = graphWithJobs();
  const contract = generateContract(graph);
  const registry = generateClientRegistry(graph);
  expect(contract).toContain('"jobs": {');
  expect(contract).toContain('"exportOrders": {');
  expect(registry).toContain('readonly "exportOrders":');
  expect(registry).toContain('readonly "jobs.exportOrders.runs.watch":');
  expect(registry).not.toContain("privateOrders");
  expect(publicFingerprint(graph)).not.toBe(
    publicFingerprint({
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.kind === "job" && node.name === "exportOrders"
          ? { ...node, client: { public: true, operations: ["trigger"] } }
          : node,
      ),
    } as ApplicationGraph),
  );
});

function graphWithJobs(): ApplicationGraph {
  return {
    contractVersion: GRAPH_VERSION,
    nodes: [
      {
        kind: "job",
        id: "orders.export",
        source: { file: "src/jobs/export.ts", line: 1, column: 1 },
        executionModel: "task",
        name: "exportOrders",
        jobId: "orders.export",
        taskId: "orders.export",
        taskVersion: "1",
        profile: "local",
        implicit: false,
        default: true,
        input: { type: "string" },
        output: { type: "string" },
        client: {
          public: true,
          operations: ["trigger", "watch"],
          fields: ["status"],
        },
      },
      {
        kind: "job",
        id: "orders.private",
        source: { file: "src/jobs/private.ts", line: 1, column: 1 },
        executionModel: "task",
        name: "privateOrders",
        jobId: "orders.private",
        taskId: "orders.private",
        taskVersion: "1",
        profile: "local",
        implicit: false,
        default: false,
        input: { type: "string" },
      },
    ],
    edges: [],
  } as unknown as ApplicationGraph;
}
