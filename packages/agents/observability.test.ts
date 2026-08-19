import { describe, expect, test } from "bun:test";
import { defineFunction } from "@zsys/functions";
import { z } from "@zsys/schema";
import { defineTool } from "@zsys/tools";
import {
  defineAgent,
  invokeAgent,
  type AgentCapturePolicy,
  type AgentRuntimeHooks,
  type AgentSpanRecord,
  type ModelTurn,
} from "./src/index.ts";

function setup(hooks?: AgentRuntimeHooks, capture?: AgentCapturePolicy) {
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ state: z.string() }),
    handler: async (input) => ({ state: input.id }),
  });
  const tool = defineTool({
    id: "orders.lookup.tool",
    target,
    description: "Look up an order.",
    sideEffect: "read",
    approval: "never",
  });
  const agent = defineAgent({
    id: "support.order",
    input: z.object({ question: z.string(), token: z.string() }),
    output: z.object({ answer: z.string() }),
    modelProfile: "default",
    instructions: "Use token=password=TOP-SECRET only for the request.",
    tools: [tool],
    limits: { maxSteps: 3, maxToolCalls: 2, timeoutMs: 1_000 },
  });
  let calls = 0;
  const provider = {
    profile: "default",
    capabilities: {
      toolCalls: true,
      cancellation: true,
      maxInputBytes: 4_096,
      maxOutputBytes: 512,
    },
    request: async (): Promise<ModelTurn> => {
      calls += 1;
      return calls === 1
        ? { type: "tool-call", callId: "call-1", toolId: tool.id, input: { id: "known" } }
        : { type: "final", output: { answer: "ready" } };
    },
  };
  return {
    agent,
    provider,
    tools: [tool],
    engine: { invoke: async () => ({ state: "ready" }) },
    hooks,
    ...(capture === undefined ? {} : { capture }),
  };
}

describe("agent observability", () => {
  test("emits safe spans and observed edges without content by default", async () => {
    const spans: AgentSpanRecord[] = [];
    const edges: unknown[] = [];
    const runtime = setup({
      onSpanStart: (span) => spans.push(span),
      onSpanComplete: (span) => spans.push(span),
      onObservedEdge: (edge) => edges.push(edge),
    });
    await expect(
      invokeAgent({
        ...runtime,
        input: { question: "Where?", token: "TOP-SECRET" },
        invocationId: "agent-1",
      }),
    ).resolves.toEqual({ answer: "ready" });
    expect(spans.map((span) => span.kind)).toEqual([
      "agent",
      "model",
      "model",
      "tool",
      "tool",
      "model",
      "model",
      "agent",
    ]);
    expect(JSON.stringify(spans)).not.toContain("TOP-SECRET");
    expect(edges).toEqual(
      expect.arrayContaining([
        { relationship: "uses-provider-profile", from: "support.order", to: "default" },
        { relationship: "uses-tool", from: "support.order", to: "orders.lookup.tool" },
        { relationship: "targets-function", from: "orders.lookup.tool", to: "orders.lookup" },
      ]),
    );
  });

  test("requires explicit bounded redacted capture for content", async () => {
    const spans: AgentSpanRecord[] = [];
    const runtime = setup(
      { onSpanComplete: (span) => spans.push(span) },
      { mode: "development-redacted", maxBytes: 1_024, redactKeys: ["token"] },
    );
    await invokeAgent({
      ...runtime,
      input: { question: "Where?", token: "TOP-SECRET" },
      invocationId: "agent-2",
    });
    const model = spans.find((span) => span.kind === "model");
    expect(model?.capture?.input?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: expect.stringContaining("[REDACTED]") }),
      ]),
    );
    expect(JSON.stringify(model)).not.toContain("TOP-SECRET");
  });
});
