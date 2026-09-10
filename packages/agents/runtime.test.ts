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
  ApprovalRequiredError,
  defineAgent,
  invokeAgent,
  type AgentRuntimeOptions,
} from "./src/index.ts";
import { createHangingTestModel, createTestModel, type TestModelTurn } from "./test-model.ts";

function setup(
  turns: readonly TestModelTurn[],
  options: { write?: boolean; maxSteps?: number; maxToolCalls?: number } = {},
) {
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
    model: "default",
    instructions: "Answer order questions.",
    tools: [tool],
    limits: {
      maxSteps: options.maxSteps ?? 3,
      maxToolCalls: options.maxToolCalls ?? 2,
      timeoutMs: 1_000,
    },
  });
  const model = createTestModel(turns);
  const runtime: AgentRuntimeOptions = {
    agent,
    modelRegistry: { resolveModel: () => ({ id: "default", model: model.model }) },
    tools: [tool],
    engine: {
      invoke: async (request) => {
        invocations.push(request);
        await request.progressSink?.emit(
          { stage: "lookup" },
          request.signal ?? new AbortController().signal,
        );
        return { state: "ready" };
      },
    },
  };
  return { runtime, calls: model.calls, invocations };
}

describe("bounded agent runtime", () => {
  test("sends bounded conversation history before the current input", async () => {
    const state = setup([{ type: "final", output: { answer: "continued" } }]);
    await invokeAgent({
      ...state.runtime,
      input: { question: "the above one?" },
      messages: [
        { role: "user", content: '{"question":"where is demo-1?"}' },
        { role: "assistant", content: '{"answer":"demo-1 is confirmed"}' },
      ],
    });
    expect(state.calls[0]).toMatchObject({
      messages: [
        { role: "system", content: [{ type: "text", text: "Answer order questions." }] },
        { role: "human", content: '{"question":"where is demo-1?"}' },
        { role: "ai", content: '{"answer":"demo-1 is confirmed"}' },
        { role: "human", content: '{"question":"the above one?"}' },
      ],
    });
  });

  test("collects canonical native events and each tool transition once", async () => {
    const state = setup([
      { type: "tool-call", callId: "call-1", toolId: "orders.lookup.tool", input: { id: "known" } },
      { type: "final", output: { answer: "ready" } },
    ]);
    const outputs: unknown[] = [];
    const toolEvents: Array<{ state: string; value?: unknown }> = [];
    const progressEvents: unknown[] = [];
    const eventKinds: string[] = [];
    let finished = 0;
    await invokeAgent({
      ...state.runtime,
      input: { question: "Where is it?" },
      contentSink: {
        emitOutput: (value) => outputs.push(value),
        finishOutput: () => {
          finished += 1;
        },
        emitEvent: (event) => eventKinds.push(event.kind),
        progressSinkForTool: (tool) => ({
          emit: (value) => {
            progressEvents.push({ ...tool, value });
          },
        }),
        emitTool: (event) => toolEvents.push(event),
      },
    });
    expect(toolEvents).toEqual([
      { state: "started", toolCallId: "call-1", toolId: "orders.lookup.tool" },
      {
        state: "input-ready",
        toolCallId: "call-1",
        toolId: "orders.lookup.tool",
        value: { id: "known" },
      },
      { state: "running", toolCallId: "call-1", toolId: "orders.lookup.tool" },
      {
        state: "succeeded",
        toolCallId: "call-1",
        toolId: "orders.lookup.tool",
        value: { state: "ready" },
      },
    ]);
    expect(outputs).toEqual([{ answer: "ready" }]);
    expect(finished).toBe(1);
    expect(new Set(eventKinds)).toEqual(
      new Set(["checkpoints", "lifecycle", "messages", "tasks", "tools", "updates", "values"]),
    );
    expect(progressEvents).toEqual([
      {
        toolCallId: "call-1",
        toolId: "orders.lookup.tool",
        value: { stage: "lookup" },
      },
    ]);
  });

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
    expect(state.calls[0]).toMatchObject({ messages: [{ role: "system" }, { role: "human" }] });

    await expect(invokeAgent({ ...state.runtime, input: { question: 7 } })).rejects.toMatchObject({
      code: "RELKIT_AGENT_INPUT_VALIDATION",
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
      code: "RELKIT_AGENT_OUTPUT_VALIDATION",
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
      code: "RELKIT_AGENT_STEP_LIMIT",
    });

    const controller = new AbortController();
    controller.abort();
    const cancelled = setup([{ type: "final", output: { answer: "never" } }]);
    await expect(
      invokeAgent({ ...cancelled.runtime, input: { question: "Hi" }, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "RELKIT_AGENT_CANCELLED" });
    expect(cancelled.calls).toHaveLength(0);

    const timeout = setup([]);
    const hanging = createHangingTestModel();
    const stalled = {
      ...timeout.runtime,
      modelRegistry: {
        resolveModel: () => ({ id: "default", model: hanging.model }),
      },
    };
    await expect(
      invokeAgent({ ...stalled, input: { question: "Hi" }, timeoutMs: 0 }),
    ).rejects.toMatchObject({ code: "RELKIT_AGENT_TIMEOUT" });
  });

  test("resolves the active native model without exposing it on the descriptor", async () => {
    const state = setup([]);
    const { modelRegistry: _registry, ...runtime } = state.runtime;
    const spans: SpanLifecycle[] = [];
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
    const { model } = createTestModel([{ type: "final", output: { answer: "registry" } }], {
      provider: "test",
      modelId: "model",
    });

    await expect(
      runInExecutionContext({ span: root, runtime: spanRuntime }, () =>
        invokeAgent({
          ...runtime,
          modelRegistry: {
            resolveModel: (selector?: string) => ({
              provider: "test",
              id: `test:${selector ?? "model"}`,
              model,
            }),
          },
          input: { question: "Hi" },
        }),
      ),
    ).resolves.toEqual({ answer: "registry" });
    completeSpan(root);
    const modelSpan = spans.find(
      ({ type, span }) => type === "completed" && span.name === "relkit.agent.support.order.model",
    )?.span;
    expect(modelSpan?.attributes.get("relkit.model.id")).toBe("test:default");
    expect("model" in state.runtime.agent).toBe(true);
    expect(typeof state.runtime.agent.model).toBe("string");
  });
});
