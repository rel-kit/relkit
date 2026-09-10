import { describe, expect, test } from "bun:test";
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
} from "./src/index.js";

const limits = { maxSteps: 10, maxToolCalls: 1, timeoutMs: 10_000 };
const engine = { invoke: () => Promise.reject(new Error("Unexpected function invocation")) };

describe("graph interruption", () => {
  test("requires a checkpointer for resumable graphs", async () => {
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
  });

  for (const example of [
    { name: "boolean", type: "boolean", schema: z.boolean(), reply: false, invalid: "yes" },
    { name: "text", type: "string", schema: z.string(), reply: "42 Example Street", invalid: 42 },
    {
      name: "structured",
      type: "object",
      schema: z.object({ approved: z.boolean(), note: z.string() }),
      reply: { approved: true, note: "checked" },
      invalid: { approved: "yes", note: "checked" },
    },
  ] as const) {
    test(`pauses and resumes ${example.name} input with node re-entry`, async () => {
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
            goto: "finish",
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
      expect(entries).toBe(1);

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
      expect(entries).toBe(2);
    });
  }

  test("rejects resume without a waiting continuation and stale dynamic routes", async () => {
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
  });

  test("maps a complete heterogeneous parallel reply batch to native interrupt IDs", async () => {
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
  });

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
