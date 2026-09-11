import { describe, expect, test } from "bun:test";
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
import { defineGraph, defineGraphNode, invokeAgent } from "./src/index.js";

const limits = { maxSteps: 20, maxToolCalls: 5, timeoutMs: 10_000 };
const unusedEngine = {
  invoke: () => Promise.reject(new Error("Unexpected function invocation")),
};

describe("native graph runtime", () => {
  test("runs sequential nodes and exposes only selected output", async () => {
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
  });

  test("supports parallel joins, conditional loops, and update-and-goto", async () => {
    const state = new StateSchema({
      seed: z.number(),
      left: z.number().optional(),
      right: z.number().optional(),
      count: z.number().optional(),
      answer: z.number().optional(),
    });
    const left = defineGraphNode({
      id: "left-node",
      input: z.object({ seed: z.number() }),
      output: z.object({ left: z.number() }),
      handler: ({ seed }) => ({ left: seed + 1 }),
    });
    const right = defineGraphNode({
      id: "right-node",
      input: z.object({ seed: z.number() }),
      output: z.object({ right: z.number() }),
      handler: ({ seed }) => ({ right: seed + 2 }),
    });
    const count = defineGraphNode({
      id: "count-node",
      input: z.object({ left: z.number(), right: z.number(), count: z.number().optional() }),
      output: z.object({ count: z.number() }),
      handler: ({ count = 0 }) => ({ count: count + 1 }),
    });
    const route = defineGraphNode({
      id: "route",
      input: z.object({ left: z.number(), right: z.number(), count: z.number() }),
      output: z.object({ answer: z.number() }),
      ends: ["count-node", "finish"] as const,
      handler: ({ left, right, count }) =>
        new Command({
          update: { answer: left + right + count },
          goto: count < 2 ? "count-node" : "finish",
        }),
    });
    const finish = defineGraphNode({
      id: "finish",
      input: z.object({ answer: z.number() }),
      output: z.object({ answer: z.number() }),
      handler: ({ answer }) => ({ answer }),
    });
    const graph = defineGraph({
      id: "control-flow",
      state,
      input: z.object({ seed: z.number() }),
      output: z.object({ answer: z.number() }),
      nodes: [left, right, count, route, finish],
      edges: (edge) =>
        edge
          .addEdge(START, "left-node")
          .addEdge(START, "right-node")
          .addEdge(["left-node", "right-node"], "count-node")
          .addEdge("count-node", "route")
          .addEdge("finish", END),
      limits,
    });

    await expect(
      invokeAgent({ agent: graph, input: { seed: 2 }, tools: {}, engine: unusedEngine }),
    ).resolves.toEqual({ answer: 9 });
  });

  test("routes function nodes through the RELKIT engine once", async () => {
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
  });

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
