import { describe, expect, test } from "bun:test";
import { defineAgent } from "@zsys/agents";
import { defineFunction } from "@zsys/functions";
import { z } from "@zsys/schema";
import { defineTool } from "@zsys/tools";
import { createTestAgent } from "./src/index.ts";

function setup(approval?: "approved" | "pending") {
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ state: z.string() }),
    handler: async () => ({ state: "ready" }),
  });
  const tool = defineTool({
    id: "orders.lookup.tool",
    target,
    description: "Look up an order",
    sideEffect: "write",
    approval: "on-write",
  });
  const agent = defineAgent({
    id: "support.order",
    input: z.object({ question: z.string() }),
    output: z.object({ answer: z.string() }),
    model: "default",
    instructions: "Answer order questions",
    tools: [tool],
    limits: { maxSteps: 3, maxToolCalls: 2, timeoutMs: 1_000 },
  });
  const invocations: unknown[] = [];
  return {
    agent: createTestAgent({
      agent,
      tools: [tool],
      engine: {
        invoke: async (request) => {
          invocations.push(request);
          return { state: "ready" };
        },
      },
      approval,
      script: [
        { type: "tool-call", callId: "call-1", toolId: tool.id, input: { id: "1" } },
        { type: "final", output: { answer: "ready" } },
      ],
    }),
    invocations,
  };
}

describe("testing agent harness", () => {
  test("runs an isolated scripted model and asserts its trace", async () => {
    const first = setup("approved");
    const second = setup("approved");
    await expect(first.agent.invoke({ question: "where" })).resolves.toEqual({ answer: "ready" });
    expect(first.agent.model.calls).toHaveLength(2);
    expect(second.agent.model.calls).toHaveLength(0);
    first.agent.trace.assert({
      spanKinds: ["agent", "model", "model", "tool", "tool", "model", "model", "agent"],
      edges: [{ relationship: "uses-tool", from: "support.order", to: "orders.lookup.tool" }],
    });
    expect(first.invocations).toHaveLength(1);
  });

  test("exposes pending approval and the named model failure point", async () => {
    const pending = setup("pending");
    const run = pending.agent.invoke({ question: "change" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pending.agent.pending()).toHaveLength(1);
    pending.agent.approvals.approve();
    await expect(run).resolves.toEqual({ answer: "ready" });

    const failed = setup("approved");
    failed.agent.failures.once("model.after-tool-call");
    await expect(failed.agent.invoke({ question: "change" })).resolves.toEqual({ answer: "ready" });
  });
});
