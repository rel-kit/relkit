import { describe, expect, test } from "vitest";
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
} from "../src/index.ts";
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
