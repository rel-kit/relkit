import { describe, expect, test } from "bun:test";
import { defineTool, ToolArgumentValidationError, invokeTool } from "@zsys/tools";
import {
  engineForTarget,
  harness,
  makeFixture,
  scriptedToolCall,
  toolMessage,
} from "./agent-matrix-helpers.ts";

describe("tool and agent tool matrix", () => {
  test("inherits target contracts and invokes the common tool engine", async () => {
    const fixture = makeFixture();
    expect(fixture.tool.target.input).toBe(fixture.target.input);
    expect(fixture.tool.target.output).toBe(fixture.target.output);
    expect(fixture.tool.target.errors?.map((error) => error.id)).toEqual([fixture.unavailable.id]);
    expect(Object.prototype.hasOwnProperty.call(fixture.tool, "handler")).toBe(false);

    const agent = harness(fixture, scriptedToolCall(fixture.tool.id));
    await expect(agent.invoke({ question: "where is order 1" })).resolves.toEqual({
      answer: "ready",
    });
    expect(fixture.invocations).toHaveLength(1);
    expect(fixture.invocations[0]).toMatchObject({
      functionId: "orders.lookup",
      source: "tool",
      timeoutMs: 25,
      errors: [{ id: "orders.unavailable" }],
    });
  });

  test("rejects unknown, unlisted, and invalid tool calls", async () => {
    const unknown = makeFixture();
    const unknownAgent = harness(unknown, scriptedToolCall("orders.unknown.tool", {}));
    await expect(unknownAgent.invoke({ question: "unknown" })).resolves.toEqual({
      answer: "ready",
    });
    expect(unknown.invocations).toHaveLength(0);
    expect(toolMessage(unknownAgent)).toMatchObject({
      role: "tool",
      content: { error: { code: "ZSYS_TOOL_NOT_ALLOWED" } },
    });

    const unlisted = makeFixture();
    const extraTool = defineTool({
      id: "orders.other.tool",
      target: unlisted.target,
      description: "Another order tool",
      sideEffect: "read",
      approval: "never",
    });
    const unlistedAgent = harness(unlisted, scriptedToolCall(extraTool.id, { id: "1" }), {
      tools: [unlisted.tool, extraTool],
    });
    await expect(unlistedAgent.invoke({ question: "unlisted" })).resolves.toEqual({
      answer: "ready",
    });
    expect(unlisted.invocations).toHaveLength(0);
    expect(toolMessage(unlistedAgent)).toMatchObject({
      content: { error: { code: "ZSYS_TOOL_NOT_ALLOWED" } },
    });

    const invalid = makeFixture();
    for (const arguments_ of ["{", { id: 7 }]) {
      await expect(
        invokeTool({
          tools: [invalid.tool],
          engine: invalid.engine,
          toolId: invalid.tool.id,
          arguments: arguments_,
        }),
      ).rejects.toBeInstanceOf(ToolArgumentValidationError);
    }
    expect(invalid.invocations).toHaveLength(0);

    const modelInvalid = makeFixture();
    const modelAgent = harness(modelInvalid, scriptedToolCall(modelInvalid.tool.id, "{"));
    await expect(modelAgent.invoke({ question: "invalid json" })).resolves.toEqual({
      answer: "ready",
    });
    expect(modelInvalid.invocations).toHaveLength(0);
    expect(toolMessage(modelAgent)).toMatchObject({
      content: { error: { code: "ZSYS_TOOL_ARGUMENT_VALIDATION" } },
    });
  });

  test("enforces required, denied, and approved side-effect policy", async () => {
    const required = makeFixture({ sideEffect: "write", approval: "on-write" });
    const requiredAgent = harness(required, [
      { type: "tool-call", callId: "call-required", toolId: required.tool.id, input: { id: "1" } },
    ]);
    await expect(requiredAgent.invoke({ question: "change" })).rejects.toMatchObject({
      code: "ZSYS_APPROVAL_REQUIRED",
    });
    expect(required.invocations).toHaveLength(0);

    const denied = makeFixture({ sideEffect: "write", approval: "on-write" });
    const deniedAgent = harness(denied, scriptedToolCall(denied.tool.id), { approval: "denied" });
    await expect(deniedAgent.invoke({ question: "change" })).resolves.toEqual({ answer: "ready" });
    expect(denied.invocations).toHaveLength(0);
    expect(toolMessage(deniedAgent)).toMatchObject({
      content: { error: { code: "ZSYS_APPROVAL_DENIED" } },
    });

    const approved = makeFixture({ sideEffect: "write", approval: "on-write" });
    const approvedAgent = harness(approved, scriptedToolCall(approved.tool.id), {
      approval: "approved",
    });
    await expect(approvedAgent.invoke({ question: "change" })).resolves.toEqual({
      answer: "ready",
    });
    expect(approved.invocations).toHaveLength(1);
  });

  test("maps declared errors and defects to bounded tool errors", async () => {
    for (const targetFailure of ["declared", "defect"] as const) {
      const fixture = makeFixture({ targetFailure });
      const agent = harness(fixture, scriptedToolCall(fixture.tool.id), {
        engine: engineForTarget(fixture.target),
      });
      await expect(agent.invoke({ question: targetFailure })).resolves.toEqual({ answer: "ready" });
      expect(toolMessage(agent)).toMatchObject({
        role: "tool",
        content: {
          error: {
            code: targetFailure === "declared" ? "orders.unavailable" : "ZSYS_UNEXPECTED_DEFECT",
            message: "Tool call failed",
          },
        },
      });
      expect(JSON.stringify(agent.model.calls)).not.toContain("database-password");
    }
  });
});
