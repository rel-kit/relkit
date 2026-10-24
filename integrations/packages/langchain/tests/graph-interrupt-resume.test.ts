/** Exercises native graph interrupt resume behavior through the integration owner, preserving the original assertions and scoped test fixtures. */

import { describe, expect, test } from "vitest";
import {
  Command,
  END,
  INTERRUPT,
  MemorySaver,
  START,
  StateGraph,
  StateSchema,
  interrupt,
} from "@langchain/langgraph";
import { z } from "@relkit/schema";
import {
  AgentRuntimeError,
  GraphInterruptedError,
  defineGraph,
  defineGraphNode,
  invokeAgent,
} from "../src/index.js";

const limits = { maxSteps: 10, maxToolCalls: 1, timeoutMs: 10_000 };
const engine = { invoke: () => Promise.reject(new Error("Unexpected function invocation")) };

describe("graph interruption", () => {
  test(
    "rejects resume without a waiting continuation and stale dynamic routes",
    caseRejectsResumeWithoutAWaitingContinuationAnd,
  );

  test(
    "maps a complete heterogeneous parallel reply batch to native interrupt IDs",
    caseMapsACompleteHeterogeneousParallelReplyBatch,
  );
});

/** Verifies that rejects resume without a waiting continuation and stale dynamic routes.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseRejectsResumeWithoutAWaitingContinuationAnd() {
  const state = new StateSchema({ value: z.string(), answer: z.string().optional() });
  const route = defineGraphNode({
    id: "route",
    input: z.object({ value: z.string() }),
    output: z.object({ answer: z.string() }),
    handler: ({ value }) => ({ answer: value }),
  });
  const graph = defineGraph({
    id: "invalid-route",
    state,
    input: z.object({ value: z.string() }),
    output: z.object({ answer: z.string() }),
    nodes: [route],
    edges: (edge) =>
      edge.addEdge(START, "route").addConditionalEdges("route", () => "missing" as "route"),
    checkpointer: new MemorySaver(),
    limits,
  });
  await expect(
    invokeAgent({
      agent: graph,
      input: "reply",
      threadId: "no-wait",
      resume: true,
      tools: {},
      engine,
    }),
  ).rejects.toThrow("Graph has no waiting continuation");
  await expect(
    invokeAgent({
      agent: graph,
      input: { value: "x" },
      threadId: "stale-route",
      tools: {},
      engine,
    }),
  ).rejects.toThrow('Unknown graph node "missing"');
}

/** Verifies that maps a complete heterogeneous parallel reply batch to native interrupt IDs.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseMapsACompleteHeterogeneousParallelReplyBatch() {
  const graph = parallelReviewFixture();
  const threadId = "parallel:batch";
  let waiting: GraphInterruptedError | undefined;
  try {
    await invokeAgent({
      agent: graph,
      input: { prompt: "review" },
      threadId,
      tools: {},
      engine,
    });
  } catch (error) {
    if (error instanceof GraphInterruptedError) waiting = error;
    else throw error;
  }
  expect(waiting?.interrupts.map(({ node }) => node)).toEqual(["approval", "collect-note"]);
  await expect(
    invokeAgent({
      agent: graph,
      input: [false, ""],
      threadId,
      resume: true,
      tools: {},
      engine,
    }),
  ).resolves.toEqual({ approved: false, note: "" });
}

/** Builds an isolated native graph for this interruption scenario; state and persistence are created once per case.
 * @returns The scenario graph and its directly observed native state.
 */
function parallelReviewFixture() {
  const state = new StateSchema({
    prompt: z.string(),
    approved: z.boolean().optional(),
    note: z.string().optional(),
  });
  const approval = defineGraphNode({
    id: "approval",
    input: z.object({ prompt: z.string() }),
    output: z.object({ approved: z.boolean() }),
    resume: z.boolean(),
    handler: () => ({ approved: interrupt({ question: "Approve?" }) as boolean }),
  });
  const note = defineGraphNode({
    id: "collect-note",
    input: z.object({ prompt: z.string() }),
    output: z.object({ note: z.string() }),
    resume: z.string(),
    handler: () => ({ note: interrupt({ question: "Note?" }) as string }),
  });
  const finish = defineGraphNode({
    id: "finish",
    input: z.object({ approved: z.boolean(), note: z.string() }),
    output: z.object({ approved: z.boolean(), note: z.string() }),
    handler: ({ approved, note }) => ({ approved, note }),
  });
  const graph = defineGraph({
    id: "parallel-interrupts",
    state,
    input: z.object({ prompt: z.string() }),
    output: z.object({ approved: z.boolean(), note: z.string() }),
    nodes: [approval, note, finish],
    edges: (edge) =>
      edge
        .addEdge(START, "approval")
        .addEdge(START, "collect-note")
        .addEdge(["approval", "collect-note"], "finish")
        .addEdge("finish", END),
    checkpointer: new MemorySaver(),
    limits,
  });
  return graph;
}
