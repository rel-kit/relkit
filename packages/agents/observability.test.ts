import { describe, expect, test } from "bun:test";
import { defineFunction } from "@relkit/functions";
import {
  completeSpan,
  runInExecutionContext,
  SpanRuntime,
  startRootSpan,
  type SpanLifecycle,
} from "@relkit/invocation";
import { z } from "@relkit/schema";
import { defineTool } from "@relkit/tools";
import {
  defineAgent,
  invokeAgent,
  type AgentCapturePolicy,
  type AgentRuntimeHooks,
} from "./src/index.ts";
import { createTestModel, type TestModelTurn } from "./test-model.ts";

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
    model: "default",
    instructions: "Use token=password=TOP-SECRET only for the request.",
    tools: [tool],
    limits: { maxSteps: 3, maxToolCalls: 2, timeoutMs: 1_000 },
  });
  const model = createTestModel([
    { type: "tool-call", callId: "call-1", toolId: tool.id, input: { id: "known" } },
    { type: "final", output: { answer: "ready" } },
  ] satisfies readonly TestModelTurn[]);
  return {
    agent,
    modelRegistry: { resolveModel: () => ({ id: "default", model: model.model }) },
    tools: [tool],
    engine: { invoke: async () => ({ state: "ready" }) },
    hooks,
    ...(capture === undefined ? {} : { capture }),
  };
}

describe("agent observability", () => {
  test("records real operations and observed edges without content", async () => {
    const spans: SpanLifecycle[] = [];
    const edges: unknown[] = [];
    const runtime = setup({
      onObservedEdge: (edge) => edges.push(edge),
    });
    const spanRuntime = new SpanRuntime({
      ids: {
        next: (kind) =>
          kind === "trace"
            ? "10000000000000000000000000000001"
            : `${spans.length + 1}`.padStart(16, "0"),
      },
      observer: (event) => spans.push(event),
    });
    const root = startRootSpan(spanRuntime, "test", "internal");
    await expect(
      runInExecutionContext({ span: root, runtime: spanRuntime }, () =>
        invokeAgent({
          ...runtime,
          input: { question: "Where?", token: "TOP-SECRET" },
          invocationId: "agent-1",
        }),
      ),
    ).resolves.toEqual({ answer: "ready" });
    completeSpan(root);
    const completed = spans.filter(({ type }) => type === "completed").map(({ span }) => span);
    expect(completed.map(({ name }) => name)).toEqual([
      "relkit.tool.orders.lookup.tool",
      "relkit.agent.support.order.model",
      "relkit.agent.support.order.invoke",
      "test",
    ]);
    expect(
      completed.find(({ name }) => name.endsWith(".model"))?.events.map(({ name }) => name),
    ).toEqual(
      expect.arrayContaining([
        "agent.model.step.started",
        "agent.tool.started",
        "agent.tool.completed",
        "agent.model.step.completed",
      ]),
    );
    const recorded = JSON.stringify(
      completed.map((span) => ({
        attributes: Object.fromEntries(span.attributes),
        events: span.events,
      })),
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    );
    expect(recorded).not.toContain("TOP-SECRET");
    expect(edges).toEqual(
      expect.arrayContaining([
        { relationship: "uses-provider-profile", from: "support.order", to: "default" },
        { relationship: "uses-tool", from: "support.order", to: "orders.lookup.tool" },
        { relationship: "targets-function", from: "orders.lookup.tool", to: "orders.lookup" },
      ]),
    );
  });

  test("never records prompt or tool content as span metadata", async () => {
    const spans: SpanLifecycle[] = [];
    const runtime = setup(undefined, {
      mode: "development-redacted",
      maxBytes: 1_024,
      redactKeys: ["token"],
    });
    const spanRuntime = new SpanRuntime({
      ids: {
        next: (kind) =>
          kind === "trace"
            ? "10000000000000000000000000000002"
            : `${spans.length + 1}`.padStart(16, "0"),
      },
      observer: (event) => spans.push(event),
    });
    const root = startRootSpan(spanRuntime, "test", "internal");
    await runInExecutionContext({ span: root, runtime: spanRuntime }, () =>
      invokeAgent({
        ...runtime,
        input: { question: "Where?", token: "TOP-SECRET" },
        invocationId: "agent-2",
      }),
    );
    completeSpan(root);
    const metadata = spans.map(({ span }) => ({
      attributes: Object.fromEntries(span.attributes),
      events: span.events,
    }));
    const serialized = JSON.stringify(metadata, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    expect(serialized).not.toContain("TOP-SECRET");
    expect(serialized).not.toContain("Where?");
  });
});
