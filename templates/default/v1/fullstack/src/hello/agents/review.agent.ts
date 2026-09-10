import { defineGraph, defineGraphNode } from "@relkit/app/agents";
import { z } from "@relkit/app/schema";
import { END, MemorySaver, START, StateSchema, interrupt } from "@langchain/langgraph";

const state = new StateSchema({
  request: z.string(),
  approved: z.boolean().optional(),
  result: z.string().optional(),
});

const review = defineGraphNode({
  id: "review",
  input: z.object({ request: z.string() }),
  output: z.object({ approved: z.boolean() }),
  resume: z.boolean(),
  handler: ({ request }) => ({
    approved: interrupt({ question: `Approve "${request}"?` }) as boolean,
  }),
});

const finish = defineGraphNode({
  id: "finish",
  input: z.object({ request: z.string(), approved: z.boolean() }),
  output: z.object({ result: z.string() }),
  handler: ({ request, approved }) => ({
    result: approved ? `${request} approved` : `${request} rejected`,
  }),
});

export default defineGraph({
  id: "hello.review",
  state,
  input: z.object({ request: z.string().min(1) }),
  output: z.object({ result: z.string() }),
  nodes: [review, finish],
  edges: (graph) =>
    graph.addEdge(START, "review").addEdge("review", "finish").addEdge("finish", END),
  checkpointer: new MemorySaver(),
  stateProfile: "default",
  client: { public: true, state: ["approved", "result"] },
  controls: ["stop"],
  limits: { maxSteps: 4, maxToolCalls: 1, timeoutMs: 10_000 },
});
