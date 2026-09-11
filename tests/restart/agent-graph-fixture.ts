import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import {
  Command,
  END,
  START,
  StateSchema,
  interrupt,
} from "../../packages/agents/node_modules/@langchain/langgraph/dist/index.js";
import type { SqliteSaver } from "../../packages/agents/node_modules/@langchain/langgraph-checkpoint-sqlite/dist/index.js";
import { defineGraph, defineGraphNode } from "../../packages/agents/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";

export function createRestartGraph(root: string, saver: SqliteSaver) {
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
    handler: async () => {
      await record(root, "review");
      return new Command({
        update: { approved: interrupt({ question: "Approve?" }) },
        goto: "finish",
      });
    },
  });
  const finish = defineGraphNode({
    id: "finish",
    input: z.object({ approved: z.boolean() }),
    output: z.object({ result: z.string() }),
    handler: async ({ approved }) => {
      await record(root, "finish");
      return { result: approved ? "approved" : "rejected" };
    },
  });
  return defineGraph({
    id: "orders.restart",
    state,
    input: z.object({ orderId: z.string() }),
    output: z.object({ result: z.string() }),
    nodes: [review, finish],
    edges: (edge) => edge.addEdge(START, "review").addEdge("finish", END),
    checkpointer: saver,
    limits: { maxSteps: 5, maxToolCalls: 1, timeoutMs: 5_000 },
    stateProfile: "default",
    client: { authorize: () => true },
  });
}

export async function waitForAgentStatus(
  client: any,
  agentId: string,
  threadId: string,
  status: "waiting" | "idle",
): Promise<any> {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    try {
      const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
      if (snapshot.thread.status === status) return snapshot;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Agent did not reach ${status}`);
}

function record(root: string, node: string): Promise<void> {
  return appendFile(join(root, "node-entries.ndjson"), `${JSON.stringify({ node })}\n`);
}
