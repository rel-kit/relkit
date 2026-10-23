/** Retains original workflow assertions for langgraph-authoring, registered by the owning suite. */
import { nativeAgentRuntimePackages } from "./native-agent-runtime.fixture.js";
import { expect } from "bun:test";
import * as ts from "typescript";
import {
  END,
  START,
  StateSchema,
} from "../../integrations/packages/langchain/node_modules/@langchain/langgraph/dist/index.js";
import { defineGraph, defineGraphNode } from "../../integrations/packages/langchain/src/index.ts";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";
import { readFacts } from "../../packages/compiler/src/discovery/source-facts.ts";
import { z } from "../../packages/schema/src/index.ts";
export function case1Workflow() {
  const source = ts.createSourceFile(
    "src/order.agent.ts",
    'import { defineGraph } from "@relkit/langchain"; export const order = defineGraph({});',
    ts.ScriptTarget.Latest,
    true,
  );

  expect(readFacts(source).factoryBindings).toContainEqual(
    expect.objectContaining({
      binding: "order",
      factory: "defineGraph",
      kind: "agent",
      idOptional: true,
    }),
  );
}

export function case2Workflow() {
  const state = new StateSchema({ input: z.string(), output: z.string().optional() });
  const run = defineGraphNode({
    id: "run",
    input: z.object({ input: z.string() }),
    output: z.object({ output: z.string() }),
    handler: ({ input }) => ({ output: input }),
  });
  const graph = defineGraph({
    id: "review-graph",
    state,
    input: z.object({ input: z.string() }),
    output: z.object({ output: z.string() }),
    nodes: [run],
    edges: (edge) => edge.addEdge(START, "run").addEdge("run", END),
    limits: { maxSteps: 3, maxToolCalls: 1, timeoutMs: 1_000 },
  });

  const result = normalizeCompilation({
    runtimeIntegrationPackages: nativeAgentRuntimePackages,
    descriptors: [graph],
  });
  const node = result.graph?.nodes.find((candidate) => candidate.id === "review-graph");

  expect(result.diagnostics).toEqual([]);
  expect(node).toEqual(
    expect.objectContaining({
      kind: "agent",
      execution: "graph",
      workflow: expect.objectContaining({
        start: START,
        end: END,
        nodes: [expect.objectContaining({ id: "run", kind: "node" })],
      }),
    }),
  );
  expect(result.graph?.edges.some((edge) => edge.kind === "uses-provider")).toBe(false);
}

export function case3Workflow() {
  const { graph, routeCalls } = inspectorWorkflowFixture();

  const result = normalizeCompilation({
    runtimeIntegrationPackages: nativeAgentRuntimePackages,
    descriptors: [graph],
  });
  const node = result.graph?.nodes.find((candidate) => candidate.id === graph.id);

  expect(routeCalls()).toBe(0);
  expect(node).toMatchObject({
    workflowTopology: {
      start: START,
      end: END,
      registeredNodes: ["first", "second"],
      conditionalRoutes: [
        {
          from: "second",
          routes: [
            { label: "again", to: "first" },
            { label: "done", to: END },
          ],
        },
      ],
      parallelBranches: [{ from: START, to: ["first", "second"] }],
      joins: [{ from: ["first", "second"], to: "second" }],
    },
  });
  expect(
    (node as { workflowTopology?: { loops: unknown[] } }).workflowTopology?.loops,
  ).toContainEqual({ from: "second", to: "first" });
}

/** Constructs the original scenario without evaluating runtime callbacks. */
function inspectorWorkflowFixture() {
  const state = new StateSchema({ input: z.string(), output: z.string().optional() });
  const first = defineGraphNode({
    id: "first",
    input: z.object({ input: z.string() }),
    output: z.object({ output: z.string() }),
    handler: ({ input }) => ({ output: input }),
  });
  const second = defineGraphNode({
    id: "second",
    input: z.object({ input: z.string() }),
    output: z.object({ output: z.string() }),
    handler: ({ input }) => ({ output: input }),
  });
  let routeCalls = 0;
  const graph = defineGraph({
    id: "inspector-workflow",
    state,
    input: z.object({ input: z.string() }),
    output: z.object({ output: z.string() }),
    nodes: [first, second],
    edges: (edge) =>
      edge
        .addEdge(START, "first")
        .addEdge(START, "second")
        .addEdge(["first", "second"], "second")
        .addConditionalEdges(
          "second",
          () => {
            routeCalls += 1;
            return "again";
          },
          { again: "first", done: END },
        ),
    limits: { maxSteps: 5, maxToolCalls: 1, timeoutMs: 1_000 },
  });
  return { graph, routeCalls: () => routeCalls };
}
