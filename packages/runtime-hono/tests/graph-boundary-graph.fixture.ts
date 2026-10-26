/** Builds the interruptible review graph and its matching RPC registration plan. */
import { Command, END, MemorySaver, START, StateSchema, interrupt } from "@langchain/langgraph";
import { defineGraph, defineGraphNode } from "@relkit/langchain";
import { type RegistrationPlan } from "@relkit/graph";
import { z } from "@relkit/schema";

export function reviewGraph(
  checkpointer: MemorySaver,
  entries: { review: number; finish: number },
) {
  const state = new StateSchema({
    orderId: z.string(),
    approved: z.boolean().optional(),
    result: z.string().optional(),
  });
  const review = defineGraphNode({
    id: "review",
    input: z.object({ orderId: z.string() }),
    output: z.object({ approved: z.boolean() }),
    resume: z.boolean(),
    ends: ["finish"] as const,
    handler: () => {
      entries.review += 1;
      const approved = interrupt({ question: "Approve?" }) as boolean;
      return new Command<unknown, { approved: boolean }, "finish">({
        update: { approved },
        goto: "finish",
      });
    },
  });
  const finish = defineGraphNode({
    id: "finish",
    input: z.object({ approved: z.boolean() }),
    output: z.object({ result: z.string() }),
    handler: ({ approved }) => {
      entries.finish += 1;
      return { result: approved ? "approved" : "rejected" };
    },
  });
  return defineGraph({
    id: "orders.boundary",
    state,
    input: z.object({ orderId: z.string() }),
    output: z.object({ result: z.string() }),
    nodes: [review, finish],
    edges: (edge) => edge.addEdge(START, "review").addEdge("finish", END),
    checkpointer,
    limits: { maxSteps: 5, maxToolCalls: 1, timeoutMs: 2_000 },
    stateProfile: "default",
    client: { authorize: () => true },
  });
}

export function graphPlan(workflow: unknown): RegistrationPlan {
  return {
    graphHash: "sha256:graph-boundary",
    functions: [],
    httpTriggers: [],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    channels: [],
    middlewares: [],
    agents: [
      {
        kind: "agent",
        id: "orders.boundary",
        source: { file: "graph.ts", line: 1, column: 1 },
        input: {},
        output: {},
        instructions: "",
        toolIds: [],
        limits: {},
        generatedFunction: {
          functionId: "relkit.agent.orders.boundary.invoke",
          generated: true,
          generatedBy: "agent",
          agentId: "orders.boundary",
        },
        profile: "default",
        stateProfile: "default",
        client: "protected",
        execution: "graph",
        workflow: workflow as never,
      },
    ],
  };
}
