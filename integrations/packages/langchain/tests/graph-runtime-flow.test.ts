/** Exercises native graph runtime flow behavior through the integration owner, preserving the original assertions and scoped test fixtures. */

import { describe, expect, test } from "vitest";
import {
  Command,
  END,
  ReducedValue,
  START,
  Send,
  StateGraph,
  StateSchema,
} from "@langchain/langgraph";
import { defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import { defineGraph, defineGraphNode, invokeAgent } from "../src/index.js";
import { limits, parallelLoopFixture, parallelLoopNodes } from "./graph-runtime-flow.fixture.js";
const unusedEngine = {
  invoke: () => Promise.reject(new Error("Unexpected function invocation")),
};

describe("native graph runtime", () => {
  test(
    "runs sequential nodes and exposes only selected output",
    caseRunsSequentialNodesAndExposesOnlySelected,
  );

  test(
    "supports parallel joins, conditional loops, and update-and-goto",
    caseSupportsParallelJoinsConditionalLoopsAndUpdate,
  );

  test(
    "routes function nodes through the RELKIT engine once",
    caseRoutesFunctionNodesThroughTheRELKITEngine,
  );
});

/** Verifies that runs sequential nodes and exposes only selected output.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseRunsSequentialNodesAndExposesOnlySelected() {
  const state = new StateSchema({
    value: z.number(),
    doubled: z.number().optional(),
    answer: z.number().optional(),
    private: z.string().optional(),
  });
  const double = defineGraphNode({
    id: "double",
    input: z.object({ value: z.number() }),
    output: z.object({ doubled: z.number(), private: z.string() }),
    handler: ({ value }) => ({ doubled: value * 2, private: "hidden" }),
  });
  const finish = defineGraphNode({
    id: "finish",
    input: z.object({ doubled: z.number() }),
    output: z.object({ answer: z.number() }),
    handler: ({ doubled }) => ({ answer: doubled + 1 }),
  });
  const graph = defineGraph({
    id: "sequential",
    state,
    input: z.object({ value: z.number() }),
    output: z.object({ answer: z.number() }),
    nodes: [double, finish],
    edges: (edge) =>
      edge
        .addEdge(START, "double")
        .addConditionalEdges("double", ({ doubled }) => (doubled === 6 ? "continue" : "stop"), {
          continue: "finish",
          stop: END,
        })
        .addEdge("finish", END),
    limits,
  });
  await expect(
    invokeAgent({ agent: graph, input: { value: 3 }, tools: {}, engine: unusedEngine }),
  ).resolves.toEqual({ answer: 7 });
}

/** Verifies that supports parallel joins, conditional loops, and update-and-goto.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseSupportsParallelJoinsConditionalLoopsAndUpdate() {
  const graph = parallelLoopFixture();
  await expect(
    invokeAgent({ agent: graph, input: { seed: 2 }, tools: {}, engine: unusedEngine }),
  ).resolves.toEqual({ answer: 9 });
}

/** Verifies that routes function nodes through the RELKIT engine once.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseRoutesFunctionNodesThroughTheRELKITEngine() {
  const lookup = defineFunction({
    id: "lookup",
    input: z.object({ value: z.number() }),
    output: z.object({ answer: z.number() }),
    handler: ({ value }) => ({ answer: value + 100 }),
  }).asGraphNode();
  const state = new StateSchema({ value: z.number(), answer: z.number().optional() });
  const graph = defineGraph({
    id: "function-boundary",
    state,
    input: z.object({ value: z.number() }),
    output: z.object({ answer: z.number() }),
    nodes: [lookup],
    edges: (edge) => edge.addEdge(START, "lookup").addEdge("lookup", END),
    limits,
  });
  const calls: string[] = [];
  const output = await invokeAgent({
    agent: graph,
    input: { value: 2 },
    tools: {},
    engine: {
      invoke: async (request) => {
        calls.push(request.functionId);
        return { answer: 102 };
      },
    },
  });
  expect(output).toEqual({ answer: 102 });
  expect(calls).toEqual(["lookup"]);
}
