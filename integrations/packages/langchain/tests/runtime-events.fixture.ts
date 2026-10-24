/** Creates isolated native runtime events fixtures; each caller owns the returned model, state and provider observations. */

import { defineFunction } from "@relkit/functions";

import { z } from "@relkit/schema";
import { defineTool } from "@relkit/tools";
import { defineAgent, type AgentRuntimeOptions } from "../src/index.ts";
import { createTestModel, type TestModelTurn } from "./test-model.ts";

export const expectedToolEvents = [
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
];

export function setup(
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
