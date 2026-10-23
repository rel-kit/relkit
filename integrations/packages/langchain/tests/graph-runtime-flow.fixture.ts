/** Creates isolated native graph runtime flow fixtures; each caller owns the returned model, state and provider observations. */

import { Command, END, START, StateSchema } from "@langchain/langgraph";

import { z } from "@relkit/schema";
import { defineGraph, defineGraphNode } from "../src/index.js";

export const limits = { maxSteps: 20, maxToolCalls: 5, timeoutMs: 10_000 };

export function parallelLoopFixture() {
  const state = new StateSchema({
    seed: z.number(),
    left: z.number().optional(),
    right: z.number().optional(),
    count: z.number().optional(),
    answer: z.number().optional(),
  });
  const nodes = parallelLoopNodes();
  const graph = defineGraph({
    id: "control-flow",
    state,
    input: z.object({ seed: z.number() }),
    output: z.object({ answer: z.number() }),
    nodes,
    edges: (edge) =>
      edge
        .addEdge(START, "left-node")
        .addEdge(START, "right-node")
        .addEdge(["left-node", "right-node"], "count-node")
        .addEdge("count-node", "route")
        .addEdge("finish", END),
    limits,
  });
  return graph;
}

export function parallelLoopNodes() {
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
        goto: count < 2 ? ("count-node" as const) : ("finish" as const),
      }),
  });
  const finish = defineGraphNode({
    id: "finish",
    input: z.object({ answer: z.number() }),
    output: z.object({ answer: z.number() }),
    handler: ({ answer }) => ({ answer }),
  });
  return [left, right, count, route, finish] as const;
}
