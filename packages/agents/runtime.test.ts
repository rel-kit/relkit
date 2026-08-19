import { describe, expect, test } from "bun:test";
import { defineFunction } from "@zsys/functions";
import { z } from "@zsys/schema";
import { defineTool } from "@zsys/tools";
import {
  ApprovalRequiredError,
  defineAgent,
  invokeAgent,
  type AgentRuntimeOptions,
} from "./src/index.ts";
import type { ModelTurn } from "./src/index.ts";

function setup(
  turns: readonly ModelTurn[],
  options: { write?: boolean; maxSteps?: number; maxToolCalls?: number } = {},
) {
  const calls: unknown[] = [];
  const invocations: unknown[] = [];
  const lookup = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ state: z.string() }),
    handler: async (input) => ({ state: input.id === "known" ? "ready" : "missing" }),
  });
  const tool = defineTool({
    id: "orders.lookup.tool",
    target: lookup,
    description: "Look up an order.",
    sideEffect: options.write ? "write" : "read",
    approval: options.write ? "on-write" : "never",
  });
  const agent = defineAgent({
    id: "support.order",
    input: z.object({ question: z.string() }),
    output: z.object({ answer: z.string() }),
    modelProfile: "default",
    instructions: "Answer order questions.",
    tools: [tool],
    limits: {
      maxSteps: options.maxSteps ?? 3,
      maxToolCalls: options.maxToolCalls ?? 2,
      timeoutMs: 1_000,
    },
  });
  const provider = {
    profile: "default",
    capabilities: {
      toolCalls: true,
      cancellation: true,
      maxInputBytes: 4_096,
      maxOutputBytes: 512,
    },
    request: async (request: { readonly messages: readonly unknown[] }): Promise<ModelTurn> => {
      calls.push(request);
      const turn = turns[calls.length - 1];
      if (turn === undefined) throw new Error("script exhausted");
      return turn;
    },
  };
  const runtime: AgentRuntimeOptions = {
    agent,
    provider,
    tools: [tool],
    engine: {
      invoke: async (request) => {
        invocations.push(request);
        return { state: "ready" };
      },
    },
  };
  return { runtime, calls, invocations };
}

describe("bounded agent runtime", () => {
  test("validates input, allowlists tools, invokes the engine, and validates output", async () => {
    const state = setup([
      { type: "tool-call", callId: "call-1", toolId: "orders.lookup.tool", input: { id: "known" } },
      { type: "final", output: { answer: "The order is ready." } },
    ]);
    await expect(
      invokeAgent({ ...state.runtime, input: { question: "Where is it?" } }),
    ).resolves.toEqual({
      answer: "The order is ready.",
    });
    expect(state.invocations).toHaveLength(1);
    expect(state.invocations[0]).toMatchObject({ source: "tool", functionId: "orders.lookup" });
    expect(state.calls).toHaveLength(2);

    await expect(invokeAgent({ ...state.runtime, input: { question: 7 } })).rejects.toMatchObject({
      code: "ZSYS_AGENT_INPUT_VALIDATION",
    });
  });

  test("returns safe errors for unlisted tools and rejects pending approval", async () => {
    const unknown = setup([
      { type: "tool-call", callId: "call-1", toolId: "orders.other.tool", input: {} },
      { type: "final", output: { answer: "I cannot access that tool." } },
    ]);
    await expect(invokeAgent({ ...unknown.runtime, input: { question: "Help" } })).resolves.toEqual(
      {
        answer: "I cannot access that tool.",
      },
    );
    expect(unknown.invocations).toHaveLength(0);

    const pending = setup(
      [
        {
          type: "tool-call",
          callId: "call-1",
          toolId: "orders.lookup.tool",
          input: { id: "known" },
        },
      ],
      { write: true },
    );
    await expect(
      invokeAgent({ ...pending.runtime, input: { question: "Change it" }, invocationId: "inv-1" }),
    ).rejects.toBeInstanceOf(ApprovalRequiredError);
    expect(pending.invocations).toHaveLength(0);

    const approved = setup(
      [
        {
          type: "tool-call",
          callId: "call-1",
          toolId: "orders.lookup.tool",
          input: { id: "known" },
        },
        { type: "final", output: { answer: "Approved." } },
      ],
      { write: true },
    );
    await expect(
      invokeAgent({
        ...approved.runtime,
        input: { question: "Change it" },
        approval: () => "approved",
      }),
    ).resolves.toEqual({ answer: "Approved." });
    expect(approved.invocations).toHaveLength(1);
  });

  test("enforces final validation, step limits, and cancellation", async () => {
    const invalid = setup([{ type: "final", output: { wrong: true } }]);
    await expect(
      invokeAgent({ ...invalid.runtime, input: { question: "Hi" } }),
    ).rejects.toMatchObject({
      code: "ZSYS_AGENT_OUTPUT_VALIDATION",
    });

    const limited = setup(
      [
        {
          type: "tool-call",
          callId: "call-1",
          toolId: "orders.lookup.tool",
          input: { id: "known" },
        },
        {
          type: "tool-call",
          callId: "call-2",
          toolId: "orders.lookup.tool",
          input: { id: "known" },
        },
      ],
      { maxSteps: 2, maxToolCalls: 4 },
    );
    await expect(
      invokeAgent({ ...limited.runtime, input: { question: "Hi" } }),
    ).rejects.toMatchObject({
      code: "ZSYS_AGENT_STEP_LIMIT",
    });

    const controller = new AbortController();
    controller.abort();
    const cancelled = setup([{ type: "final", output: { answer: "never" } }]);
    await expect(
      invokeAgent({ ...cancelled.runtime, input: { question: "Hi" }, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ZSYS_AGENT_CANCELLED" });
    expect(cancelled.calls).toHaveLength(0);

    const timeout = setup([]);
    const stalled = {
      ...timeout.runtime,
      provider: {
        ...timeout.runtime.provider,
        request: () => new Promise<ModelTurn>(() => undefined),
      },
    };
    await expect(
      invokeAgent({ ...stalled, input: { question: "Hi" }, timeoutMs: 0 }),
    ).rejects.toMatchObject({ code: "ZSYS_AGENT_TIMEOUT" });
  });
});
