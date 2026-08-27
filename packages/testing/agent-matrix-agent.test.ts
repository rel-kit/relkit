import { describe, expect, test } from "bun:test";
import { generatedAgentFunctionId } from "@relkit/agents";
import { harness, makeFixture, scriptedToolCall } from "./agent-matrix-helpers.ts";

describe("agent limit and privacy matrix", () => {
  test("keeps generated identity and capture disabled by default", async () => {
    const fixture = makeFixture();
    const agent = harness(fixture, scriptedToolCall(fixture.tool.id));
    await agent.invoke({ question: "password=matrix-secret" });

    const trace = agent.trace.read();
    const root = trace.spans.find((span) => span.kind === "agent" && span.status === "started");
    expect(root?.functionId).toBe(generatedAgentFunctionId(fixture.agent.id));
    expect(trace.spans.some((span) => span.kind === "model")).toBe(true);
    expect(trace.spans.every((span) => span.capture === undefined)).toBe(true);
    expect(JSON.stringify(trace)).not.toContain("matrix-secret");
    expect(JSON.stringify(trace)).not.toContain("Answer order questions");
  });

  test("validates final output and enforces step and tool-call limits", async () => {
    const invalid = makeFixture();
    const invalidAgent = harness(invalid, [{ type: "final", output: { wrong: true } }]);
    await expect(invalidAgent.invoke({ question: "invalid" })).rejects.toMatchObject({
      code: "RELKIT_AGENT_OUTPUT_VALIDATION",
    });

    const steps = makeFixture({ maxSteps: 1 });
    const stepAgent = harness(steps, scriptedToolCall(steps.tool.id));
    await expect(stepAgent.invoke({ question: "steps" })).rejects.toMatchObject({
      code: "RELKIT_AGENT_STEP_LIMIT",
    });
    expect(steps.invocations).toHaveLength(1);
    expect(stepAgent.model.calls).toHaveLength(1);

    const tools = makeFixture({ maxToolCalls: 1 });
    const toolAgent = harness(tools, [
      { type: "tool-call", callId: "call-1", toolId: tools.tool.id, input: { id: "1" } },
      { type: "tool-call", callId: "call-2", toolId: tools.tool.id, input: { id: "2" } },
    ]);
    await expect(toolAgent.invoke({ question: "tools" })).rejects.toMatchObject({
      code: "RELKIT_AGENT_TOOL_LIMIT",
    });
    expect(tools.invocations).toHaveLength(1);
    expect(toolAgent.model.calls).toHaveLength(2);
  });

  test("enforces content-size, timeout, and cancellation limits", async () => {
    const size = makeFixture();
    const inputAgent = harness(size, [{ type: "final", output: { answer: "ok" } }], {
      maxInputBytes: 16,
    });
    await expect(inputAgent.invoke({ question: "x".repeat(100) })).rejects.toMatchObject({
      code: "RELKIT_AGENT_RESPONSE_LIMIT",
    });
    expect(inputAgent.model.calls).toHaveLength(0);

    const outputAgent = harness(size, [{ type: "final", output: { answer: "x".repeat(100) } }], {
      maxOutputBytes: 16,
    });
    await expect(outputAgent.invoke({ question: "size" })).rejects.toMatchObject({
      code: "RELKIT_AGENT_RESPONSE_LIMIT",
    });

    const timeoutAgent = harness(size, [], { model: { hang: true } });
    await expect(
      timeoutAgent.invoke({ question: "timeout" }, { timeoutMs: 0 }),
    ).rejects.toMatchObject({ code: "RELKIT_AGENT_TIMEOUT" });

    const controller = new AbortController();
    controller.abort();
    const cancelledAgent = harness(size, [{ type: "final", output: { answer: "never" } }]);
    await expect(
      cancelledAgent.invoke({ question: "cancel" }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "RELKIT_AGENT_CANCELLED" });
    expect(cancelledAgent.model.calls).toHaveLength(0);
  });
});
