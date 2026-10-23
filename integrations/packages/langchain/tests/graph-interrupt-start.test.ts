/** Exercises native graph interrupt start behavior through the integration owner, preserving the original assertions and scoped test fixtures. */

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

const resumeCases = [
  { name: "boolean", type: "boolean", schema: z.boolean(), reply: false, invalid: "yes" },
  {
    name: "text",
    type: "string",
    schema: z.string(),
    reply: "42 Example Street",
    invalid: 42,
  },
  {
    name: "structured",
    type: "object",
    schema: z.object({ approved: z.boolean(), note: z.string() }),
    reply: { approved: true, note: "checked" },
    invalid: { approved: "yes", note: "checked" },
  },
] as const;

const limits = { maxSteps: 10, maxToolCalls: 1, timeoutMs: 10_000 };
const engine = { invoke: () => Promise.reject(new Error("Unexpected function invocation")) };

describe("graph interruption", () => {
  test("requires a checkpointer for resumable graphs", caseRequiresACheckpointerForResumableGraphs);

  for (const example of resumeCases) {
    test(`pauses and resumes ${example.name} input with node re-entry`, () =>
      runResumeCase(example));
  }
});

/** Verifies that requires a checkpointer for resumable graphs.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseRequiresACheckpointerForResumableGraphs() {
  const state = new StateSchema({ prompt: z.string(), approved: z.boolean().optional() });
  const review = defineGraphNode({
    id: "review",
    input: z.object({ prompt: z.string() }),
    output: z.object({ approved: z.boolean() }),
    resume: z.boolean(),
    handler: () => ({ approved: true }),
  });
  const graph = defineGraph({
    id: "missing-checkpointer",
    state,
    input: z.object({ prompt: z.string() }),
    output: z.object({ approved: z.boolean() }),
    nodes: [review],
    edges: (edge) => edge.addEdge(START, "review").addEdge("review", END),
    limits,
  });
  await expect(
    invokeAgent({
      agent: graph,
      input: { prompt: "review" },
      threadId: "missing-checkpointer",
      tools: {},
      engine,
    }),
  ).rejects.toThrow("Graphs with resumable nodes require a checkpointer");
}

/** Constructs the native resumable review fixture once for its owning case, preserving callback and resource identity.
 * @param example - Original typed resume case whose schema and reply drive the graph.
 * @returns The unchanged native descriptors and directly observed fixture values.
 */
function resumableReviewFixture(example: (typeof resumeCases)[number]) {
  const checkpointer = new MemorySaver();
  const state = new StateSchema({
    prompt: z.string(),
    answer: example.schema.optional(),
  });
  let entries = 0;
  const review = defineGraphNode({
    id: "review",
    input: z.object({ prompt: z.string() }),
    output: z.object({ answer: example.schema }),
    resume: example.schema,
    ends: ["finish"] as const,
    handler: () => {
      entries += 1;
      return new Command({
        update: { answer: interrupt({ question: "Reply now" }) as never },
        goto: "finish" as const,
      });
    },
  });
  const finish = defineGraphNode({
    id: "finish",
    input: z.object({ answer: example.schema }),
    output: z.object({ answer: example.schema }),
    handler: ({ answer }) => ({ answer }),
  });
  const graph = defineGraph({
    id: `interrupt-${example.name}`,
    state,
    input: z.object({ prompt: z.string() }),
    output: z.object({ answer: example.schema }),
    nodes: [review, finish],
    edges: (edge) => edge.addEdge(START, "review").addEdge("finish", END),
    checkpointer,
    limits,
  });
  return { graph, entries: () => entries };
}

/** Checks suspension, invalid input rejection and resumed node re-entry for one native schema.
 * @param example - Original scalar or structured resume case.
 * @returns Completion after all original interruption and resume assertions settle.
 */
async function runResumeCase(example: (typeof resumeCases)[number]) {
  const { graph, entries } = resumableReviewFixture(example);
  const threadId = `order:${example.name}`;

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
  expect(waiting?.interrupts).toEqual([
    expect.objectContaining({
      node: "review",
      value: { question: "Reply now" },
      response: expect.objectContaining({ type: example.type }),
    }),
  ]);
  expect(entries()).toBe(1);

  await expect(
    invokeAgent({
      agent: graph,
      input: example.invalid,
      threadId,
      resume: true,
      tools: {},
      engine,
    }),
  ).rejects.toBeInstanceOf(AgentRuntimeError);

  await expect(
    invokeAgent({
      agent: graph,
      input: example.reply,
      threadId,
      resume: true,
      tools: {},
      engine,
    }),
  ).resolves.toEqual({ answer: example.reply });
  expect(entries()).toBe(2);
}
