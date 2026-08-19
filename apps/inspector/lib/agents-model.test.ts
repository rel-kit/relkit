import { describe, expect, test } from "bun:test";
import type { InspectorGraph, InspectorObject } from "./api-types";
import { agentView, toolView } from "./agents-model";

const graph = {
  protocol: "zsys.inspector",
  version: 1,
  generationId: "generation-one",
  graphHash: "sha256:one",
  nodes: [
    {
      kind: "function",
      id: "orders.run",
      input: { type: "object", properties: { orderId: { type: "string" } } },
      output: { type: "object" },
      errors: [{ id: "order-not-found" }],
    },
    {
      kind: "tool",
      id: "orders.tool",
      targetFunctionId: "orders.run",
      description: "Run an order operation",
      sideEffect: "write",
      approval: "always",
      timeoutMs: 2_000,
    },
    {
      kind: "agent",
      id: "orders.agent",
      input: { type: "object" },
      output: { type: "string" },
      instructions: "raw agent instructions",
      modelProfile: "local-fast",
      toolIds: ["orders.tool"],
      limits: { maxSteps: 4, maxToolCalls: 2, timeoutMs: 10_000 },
      generatedFunction: { functionId: "zsys.agent.orders.agent.invoke" },
    },
  ],
} as InspectorGraph;

const runtime = [
  {
    toolId: "orders.tool",
    invocationId: "invocation-1",
    toolCallId: "call-1",
    approval: {
      state: "pending",
      invocationId: "invocation-1",
      toolCallId: "call-1",
      toolId: "orders.tool",
      sideEffect: "write",
      policy: "always",
      required: true,
    },
    status: "started",
    startedAt: "2026-08-17T10:00:02.000Z",
    prompt: "raw prompt",
    result: "raw result",
  },
  {
    agentId: "orders.agent",
    id: "orders.agent",
    status: "completed",
    startedAt: "2026-08-17T10:00:01.000Z",
    prompt: "raw agent prompt",
    result: "raw model result",
  },
] satisfies readonly InspectorObject[];

const spans = [
  {
    kind: "model",
    spanId: "model-1",
    invocationId: "invocation-1",
    traceId: "trace-1",
    name: "orders.agent.model",
    profile: "local-fast",
    step: 1,
    status: "completed",
    startedAt: "2026-08-17T10:00:03.000Z",
    completedAt: "2026-08-17T10:00:04.000Z",
    durationMs: 1_000,
    attributes: {
      "zsys.model.profile": "local-fast",
      prompt: "raw prompt",
      result: "raw result",
    },
  },
  {
    kind: "tool",
    spanId: "tool-1",
    invocationId: "invocation-1",
    traceId: "trace-1",
    name: "orders.agent.tool.orders.tool",
    toolId: "orders.tool",
    toolCallId: "call-1",
    status: "started",
    startedAt: "2026-08-17T10:00:02.500Z",
  },
] satisfies readonly InspectorObject[];

describe("inspector tool and agent projections", () => {
  test("joins tool contracts and exposes pending approval metadata", () => {
    const view = toolView(graph, runtime, "orders.tool", spans);
    expect(view).toMatchObject({
      id: "orders.tool",
      targetFunctionId: "orders.run",
      sideEffect: "write",
      approvalPolicy: "always",
      input: graph.nodes?.[0]?.input,
      output: graph.nodes?.[0]?.output,
      errors: graph.nodes?.[0]?.errors,
    });
    expect(view?.pendingApprovals).toEqual([
      expect.objectContaining({ invocationId: "invocation-1", toolCallId: "call-1" }),
    ]);
    expect(view?.timeline.map((entry) => entry.id)).toEqual(["orders.tool", "tool-1", "model-1"]);
  });

  test("keeps agent limits and model/tool span metadata without raw content", () => {
    const view = agentView(graph, runtime, "orders.agent", spans);
    expect(view).toMatchObject({
      id: "orders.agent",
      modelProfile: "local-fast",
      limits: { maxSteps: 4, maxToolCalls: 2, timeoutMs: 10_000 },
      toolIds: ["orders.tool"],
      generatedFunctionId: "zsys.agent.orders.agent.invoke",
    });
    expect(view?.spans).toHaveLength(2);
    expect(view?.spans[0]).toMatchObject({
      kind: "model",
      profile: "local-fast",
      step: 1,
      durationMs: 1_000,
    });
    expect(view?.spans[1]).toMatchObject({
      kind: "tool",
      toolId: "orders.tool",
      toolCallId: "call-1",
    });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("raw prompt");
    expect(serialized).not.toContain("raw result");
    expect(serialized).not.toContain("instructions");
  });
});
