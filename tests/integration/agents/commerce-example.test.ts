import { describe, expect, test } from "bun:test";
import orderSupport from "../../../examples/commerce/src/agents/order-support.agent.ts";
import getOrder from "../../../examples/commerce/src/functions/orders/get-order.function.ts";
import getOrderTool from "../../../examples/commerce/src/tools/lookup-order.tool.ts";
import {
  invokeFunction,
  type InvocationCompletion,
  type InvocationParent,
  type SpanRecord,
} from "../../../packages/engine/src/index.ts";
import { bindDescriptorIdentity } from "../../../packages/invocation/dist/index.js";
import { createTestAgent } from "../../../packages/testing/src/index.ts";

bindDescriptorIdentity(getOrder, "orders.get-order");
bindDescriptorIdentity(getOrderTool.target, "orders.get-order");

describe("commerce-example support agent", () => {
  test("runs a scripted tool call through the function engine without storing content", async () => {
    const functionSpans: SpanRecord[] = [];
    const completions: InvocationCompletion[] = [];
    const agent = createTestAgent({
      agent: orderSupport,
      tools: [getOrderTool],
      engine: {
        invoke: async (request) => {
          const parent = request.parent as InvocationParent | undefined;
          return invokeFunction(getOrder, request.input, {
            source: request.source,
            ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
            ...(request.signal === undefined ? {} : { signal: request.signal }),
            ...(parent === undefined ? {} : { parent }),
            hooks: {
              onSpanStart: (span) => functionSpans.push(span),
              onSpanComplete: (span) => functionSpans.push(span),
              onCompletion: (completion) => completions.push(completion),
            },
          });
        },
      },
      script: [
        {
          type: "tool-call",
          callId: "call-1",
          toolId: "lookup-order",
          input: { orderId: "order-1" },
        },
        { type: "final", output: { answer: "raw-result-secret" } },
      ],
    });

    await expect(agent.invoke({ question: "raw-prompt-secret" })).resolves.toEqual({
      answer: "raw-result-secret",
    });

    expect(orderSupport.model).toBe("openai:gpt-5-mini");
    expect(getOrderTool.id).toBe("lookup-order");
    expect(agent.model.calls).toHaveLength(2);
    agent.trace.assert({
      spanKinds: ["agent", "model", "model", "tool", "tool", "model", "model", "agent"],
      edges: [
        { relationship: "uses-provider-profile", from: orderSupport.id, to: "default" },
        { relationship: "uses-tool", from: orderSupport.id, to: "lookup-order" },
      ],
    });

    const trace = agent.trace.read();
    const agentSpan = trace.spans.find(
      (span) => span.kind === "agent" && span.status === "started",
    );
    const modelSpans = trace.spans.filter(
      (span) => span.kind === "model" && span.status === "started",
    );
    const toolSpan = trace.spans.find((span) => span.kind === "tool" && span.status === "started");
    const functionSpan = functionSpans.find((span) => span.status === "started");
    const targetEdge = trace.edges.find(
      (edge) => edge.relationship === "targets-function" && edge.from === "lookup-order",
    );

    expect(agentSpan?.functionId).toBe(`relkit.agent.${orderSupport.id}.invoke`);
    expect(modelSpans.map((span) => span.parentSpanId)).toEqual([
      agentSpan?.spanId,
      agentSpan?.spanId,
    ]);
    expect(toolSpan).toMatchObject({
      parentSpanId: modelSpans[0]?.spanId,
    });
    expect(targetEdge?.to).toMatch(/^unbound\./);
    expect(functionSpan).toMatchObject({
      functionId: "orders.get-order",
      source: "tool",
      parentSpanId: toolSpan?.spanId,
    });
    expect(completions).toHaveLength(1);
    expect(completions[0]?.record).toMatchObject({
      functionId: "orders.get-order",
      source: "tool",
    });

    const allSpans = [...trace.spans, ...functionSpans];
    const spanIds = new Set(allSpans.map((span) => span.spanId));
    expect(
      allSpans.every((span) => span.parentSpanId === undefined || spanIds.has(span.parentSpanId)),
    ).toBe(true);
    const serializedTrace = JSON.stringify(trace);
    expect(trace.spans.every((span) => span.capture === undefined)).toBe(true);
    expect(serializedTrace).not.toContain("raw-prompt-secret");
    expect(serializedTrace).not.toContain("raw-result-secret");
  });
});
