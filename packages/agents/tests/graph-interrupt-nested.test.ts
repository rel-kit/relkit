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
  test("resumes an interrupt nested in a subgraph", async () => {
    const state = new StateSchema({ prompt: z.string(), approved: z.boolean().optional() });
    let entries = 0;
    const review = defineGraphNode({
      id: "review",
      input: z.object({ prompt: z.string() }),
      output: z.object({ approved: z.boolean() }),
      resume: z.boolean(),
      handler: () => {
        entries += 1;
        return { approved: interrupt({ question: "Approve nested work?" }) as boolean };
      },
    });
    const child = defineGraph({
      id: "child-review",
      state,
      input: z.object({ prompt: z.string() }),
      output: z.object({ approved: z.boolean() }),
      nodes: [review],
      edges: (edge) => edge.addEdge(START, "review").addEdge("review", END),
      limits,
    });
    const parent = defineGraph({
      id: "parent-review",
      state,
      input: z.object({ prompt: z.string() }),
      output: z.object({ approved: z.boolean() }),
      nodes: [child.asGraphNode({ id: "nested" })],
      edges: (edge) => edge.addEdge(START, "nested").addEdge("nested", END),
      checkpointer: new MemorySaver(),
      limits,
    });
    const threadId = "nested:review";

    let waiting: GraphInterruptedError | undefined;
    try {
      await invokeAgent({
        agent: parent,
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
      expect.objectContaining({ node: "nested/review", response: { type: "boolean" } }),
    ]);
    await expect(
      invokeAgent({
        agent: parent,
        input: false,
        threadId,
        resume: true,
        tools: {},
        engine,
      }),
    ).resolves.toEqual({ approved: false });
    expect(entries).toBe(2);
  });

  test("matches native pause value and resume result", async () => {
    const state = new StateSchema({ prompt: z.string(), answer: z.boolean().optional() });
    const action = () => ({ answer: interrupt({ question: "Approve?" }) as boolean });
    const directSaver = new MemorySaver();
    const direct = new StateGraph({ state })
      .addNode("review", action)
      .addEdge(START, "review")
      .addEdge("review", END)
      .compile({ checkpointer: directSaver });
    const node = defineGraphNode({
      id: "review",
      input: z.object({ prompt: z.string() }),
      output: z.object({ answer: z.boolean() }),
      resume: z.boolean(),
      handler: action,
    });
    const graph = defineGraph({
      id: "interrupt-parity",
      state,
      input: z.object({ prompt: z.string() }),
      output: z.object({ answer: z.boolean() }),
      nodes: [node],
      edges: (edge) => edge.addEdge(START, "review").addEdge("review", END),
      checkpointer: new MemorySaver(),
      limits,
    });
    const directConfig = { configurable: { thread_id: "direct" } };
    const directWaiting = await direct.invoke({ prompt: "review" }, directConfig);
    let relkitWaiting: GraphInterruptedError | undefined;
    try {
      await invokeAgent({
        agent: graph,
        input: { prompt: "review" },
        threadId: "relkit",
        tools: {},
        engine,
      });
    } catch (error) {
      if (error instanceof GraphInterruptedError) relkitWaiting = error;
      else throw error;
    }

    expect(relkitWaiting?.interrupts[0]?.value).toEqual(directWaiting[INTERRUPT][0]?.value);
    const [directOutput, relkitOutput] = await Promise.all([
      direct.invoke(new Command({ resume: true }), directConfig),
      invokeAgent({
        agent: graph,
        input: true,
        threadId: "relkit",
        resume: true,
        tools: {},
        engine,
      }),
    ]);
    expect(relkitOutput).toEqual({ answer: directOutput.answer });
  });
});
