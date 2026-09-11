import { Command, END, START, StateSchema, interrupt } from "@langchain/langgraph";
import { defineGraph, defineGraphNode } from "@relkit/app/agents";
import { z } from "@relkit/app/schema";
import { orderCheckpoints, orderMemory } from "./order-agent-persistence.js";

const state = new StateSchema({
  orderId: z.string(),
  inventory: z.string().optional(),
  risk: z.string().optional(),
  attempts: z.number().optional(),
  approved: z.boolean().optional(),
  result: z.string().optional(),
});

const inventory = defineGraphNode({
  id: "load-inventory",
  input: z.object({ orderId: z.string() }),
  output: z.object({ inventory: z.string() }),
  handler: ({ orderId }) => ({ inventory: `${orderId}:available` }),
});

const risk = defineGraphNode({
  id: "assess-risk",
  input: z.object({ orderId: z.string() }),
  output: z.object({ risk: z.string() }),
  handler: ({ orderId }) => ({ risk: `${orderId}:low` }),
});

const retry = defineGraphNode({
  id: "retry",
  input: z.object({ attempts: z.number().optional() }),
  output: z.object({ attempts: z.number() }),
  handler: ({ attempts }) => ({ attempts: (attempts ?? 0) + 1 }),
});

const review = defineGraphNode({
  id: "review",
  input: z.object({ inventory: z.string(), risk: z.string() }),
  output: z.object({ approved: z.boolean() }),
  resume: z.boolean(),
  ends: ["finish"] as const,
  handler: ({ inventory, risk }) =>
    new Command({
      update: {
        approved: interrupt({ question: "Approve this order?", inventory, risk }),
      },
      goto: "finish" as const,
    }),
});

const finish = defineGraphNode({
  id: "finish",
  input: z.object({ approved: z.boolean() }),
  output: z.object({ result: z.string() }),
  handler: ({ approved }) => ({ result: approved ? "approved" : "rejected" }),
});

const orderReview = defineGraph({
  state,
  input: z.object({ orderId: z.string() }),
  output: z.object({ result: z.string() }),
  nodes: [inventory, risk, retry, review, finish],
  edges: (edge) =>
    edge
      .addEdge(START, "load-inventory")
      .addEdge(START, "assess-risk")
      .addEdge(["load-inventory", "assess-risk"], "retry")
      .addConditionalEdges("retry", ({ attempts }) => (attempts === 1 ? "again" : "ready"), {
        again: "retry",
        ready: "review",
      })
      .addEdge("finish", END),
  checkpointer: orderCheckpoints,
  store: orderMemory,
  limits: { maxSteps: 10, maxToolCalls: 1, timeoutMs: 20_000 },
  stateProfile: "agents",
  client: {
    public: true,
    state: ["inventory", "risk", "attempts", "approved", "result"],
  },
  controls: ["stop"],
});

export default orderReview;
