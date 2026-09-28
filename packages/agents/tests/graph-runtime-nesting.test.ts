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

const limits = { maxSteps: 20, maxToolCalls: 5, timeoutMs: 10_000 };
const unusedEngine = {
  invoke: () => Promise.reject(new Error("Unexpected function invocation")),
};

describe("native graph runtime", () => {
  test("supports Send fan-out with native reducers", async () => {
    const state = new StateSchema({
      items: z.array(z.number()),
      item: z.number().optional(),
      results: new ReducedValue(z.array(z.number()).default([]), {
        inputSchema: z.number(),
        reducer: (current = [], next) => [...current, next],
      }),
    });
    const worker = defineGraphNode({
      id: "worker",
      input: z.object({ item: z.number() }),
      output: z.object({ results: z.number() }),
      handler: ({ item }) => ({ results: item * 2 }),
    });
    const graph = defineGraph({
      id: "send",
      state,
      input: z.object({ items: z.array(z.number()) }),
      output: z.object({ results: z.array(z.number()) }),
      nodes: [worker],
      edges: (edge) =>
        edge
          .addConditionalEdges(START, ({ items }) =>
            items.map((item) => new Send("worker", { item })),
          )
          .addEdge("worker", END),
      limits,
    });

    const result = await invokeAgent({
      agent: graph,
      input: { items: [1, 2, 3] },
      tools: {},
      engine: unusedEngine,
    });
    expect(result).toEqual({ results: [2, 4, 6] });
  });

  test("supports nested graphs and Command.PARENT", async () => {
    const state = new StateSchema({ value: z.number(), answer: z.number().optional() });
    const exit = defineGraphNode({
      id: "child-exit",
      input: z.object({ value: z.number() }),
      output: z.object({ answer: z.number() }),
      handler: ({ value }) =>
        new Command({ graph: Command.PARENT, update: { answer: value + 1 }, goto: "after" }),
    });
    const child = defineGraph({
      id: "child",
      state,
      input: z.object({ value: z.number() }),
      output: z.object({ answer: z.number() }),
      nodes: [exit],
      edges: (edge) => edge.addEdge(START, "child-exit").addEdge("child-exit", END),
      limits,
    });
    const after = defineGraphNode({
      id: "after",
      input: z.object({ answer: z.number() }),
      output: z.object({ answer: z.number() }),
      handler: ({ answer }) => ({ answer: answer * 2 }),
    });
    const childNode = child.asGraphNode({ id: "nested", ends: ["after"] });
    const parent = defineGraph({
      id: "parent",
      state,
      input: z.object({ value: z.number() }),
      output: z.object({ answer: z.number() }),
      nodes: [childNode, after],
      edges: (edge) => edge.addEdge(START, "nested").addEdge("after", END),
      limits,
    });

    expect(parent.workflow.nodes[0]).toEqual(
      expect.objectContaining({ kind: "subgraph", workflow: child.workflow }),
    );
    await expect(
      invokeAgent({ agent: parent, input: { value: 4 }, tools: {}, engine: unusedEngine }),
    ).resolves.toEqual({ answer: 10 });
  });

  test("matches direct native sequential execution", async () => {
    const state = new StateSchema({ value: z.number(), answer: z.number().optional() });
    const node = defineGraphNode({
      id: "run",
      input: z.object({ value: z.number() }),
      output: z.object({ answer: z.number() }),
      handler: ({ value }) => ({ answer: value + 1 }),
    });
    const graph = defineGraph({
      id: "parity",
      state,
      input: z.object({ value: z.number() }),
      output: z.object({ answer: z.number() }),
      nodes: [node],
      edges: (edge) => edge.addEdge(START, "run").addEdge("run", END),
      limits,
    });
    const native = new StateGraph({ state })
      .addNode("run", ({ value }) => ({ answer: value + 1 }))
      .addEdge(START, "run")
      .addEdge("run", END)
      .compile();

    const [relkit, direct] = await Promise.all([
      invokeAgent({ agent: graph, input: { value: 4 }, tools: {}, engine: unusedEngine }),
      native.invoke({ value: 4 }),
    ]);
    expect(relkit).toEqual({ answer: direct.answer });
  });
});
