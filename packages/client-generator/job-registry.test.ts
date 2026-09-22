import { expect, test } from "bun:test";
import { GRAPH_VERSION } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import {
  generateClientContractDocument,
  generateClientRegistry,
  generateClientRegistryFromDocument,
  generateContract,
  jobProcedureSourcesFromDocument,
} from "./src/index.ts";

test("generates public jobs from graph and serialized contract with stable paths", () => {
  const graph = jobGraph();
  const contract = generateContract(graph);
  expect(contract).toContain('"jobs": {');
  expect(contract).toContain('"exportOrders": {');
  expect(contract).toContain('"runs": {');
  expect(contract).toContain("RunWatchFrame");
  expect(contract).not.toContain("hiddenJob");
  expect(contract).not.toContain("legacyJob");

  const document = JSON.parse(generateClientContractDocument(graph, "sha256:graph")) as {
    jobs: readonly {
      name: string;
      jobId: string;
      procedurePaths: Record<string, readonly string[]>;
    }[];
  };
  expect(document.jobs).toHaveLength(1);
  expect(document.jobs[0]?.jobId).toBe("orders.export");
  expect(document.jobs[0]?.procedurePaths.stream).toEqual([
    "jobs",
    "exportOrders",
    "runs",
    "stream",
  ]);
  expect(generateClientRegistry(graph)).toContain('readonly "exportOrders":');
  expect(generateClientRegistry(graph)).toContain('readonly "jobs.exportOrders.runs.watch":');
  expect(
    generateClientRegistryFromDocument(document as unknown as Record<string, unknown>),
  ).toContain('readonly "jobs.exportOrders.runs.stream":');
  expect(generateContract(jobGraph())).toContain('"exportOrders": {');
  expect(jobProcedureSourcesFromDocument(document.jobs).length).toBe(1);
});

function jobGraph(): ApplicationGraph {
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
        input: { type: "object", properties: { orderId: { type: "string" } } },
        output: { type: "object", properties: { url: { type: "string" } } },
        progress: { type: "number" },
        streams: { text: { type: "string" } },
        client: {
          public: true,
          operations: ["trigger", "get", "list", "watch", "stream", "cancel", "retry"],
          fields: ["status", "output", "progress"],
          streams: ["text"],
        },
      },
      {
        kind: "job",
        id: "hidden.job",
        source: { file: "src/jobs/hidden.ts", line: 1, column: 1 },
        executionModel: "task",
        name: "hiddenJob",
        jobId: "hidden.job",
        taskId: "hidden.task",
        taskVersion: "1",
        profile: "local",
        implicit: true,
        default: true,
        input: { type: "string" },
      },
      {
        kind: "job",
        id: "legacy.job",
        source: { file: "src/jobs/legacy.ts", line: 1, column: 1 },
        executionModel: "legacy-function",
        input: { type: "string" },
        targetFunctionId: "legacy.handler",
        profile: "local",
      },
    ],
    edges: [],
  } as unknown as ApplicationGraph;
}
