/** Exercises native runtime events behavior through the integration owner, preserving the original assertions and scoped test fixtures. */

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
import { setup, expectedToolEvents } from "./runtime-events.fixture.js";

describe("bounded agent runtime", () => {
  test(
    "sends bounded conversation history before the current input",
    caseSendsBoundedConversationHistoryBeforeTheCurrent,
  );

  test(
    "collects canonical native events and each tool transition once",
    caseCollectsCanonicalNativeEventsAndEachTool,
  );

  test(
    "validates input, allowlists tools, invokes the engine, and validates output",
    caseValidatesInputAllowlistsToolsInvokesTheEngine,
  );
});

/** Verifies that sends bounded conversation history before the current input.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseSendsBoundedConversationHistoryBeforeTheCurrent() {
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
}

/** Verifies that collects canonical native events and each tool transition once.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseCollectsCanonicalNativeEventsAndEachTool() {
  const state = setup([
    {
      type: "tool-call",
      callId: "call-1",
      toolId: "orders.lookup.tool",
      input: { id: "known" },
    },
    { type: "final", output: { answer: "ready" } },
  ]);
  const outputs: unknown[] = [];
  const toolEvents: Array<{
    state: string;
    value?: unknown;
  }> = [];
  const progressEvents: unknown[] = [];
  const eventKinds: string[] = [];
  let finished = 0;
  await invokeAgent({
    ...state.runtime,
    input: { question: "Where is it?" },
    contentSink: {
      emitOutput: (value) => void outputs.push(value),
      finishOutput: () => {
        finished += 1;
      },
      emitEvent: (event) => void eventKinds.push(event.kind),
      progressSinkForTool: (tool) => ({
        emit: (value) => {
          progressEvents.push({ ...tool, value });
        },
      }),
      emitTool: (event) => void toolEvents.push(event),
    },
  });
  expect(toolEvents).toEqual(expectedToolEvents);
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
}

/** Verifies that validates input, allowlists tools, invokes the engine, and validates output.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseValidatesInputAllowlistsToolsInvokesTheEngine() {
  const state = setup([
    {
      type: "tool-call",
      callId: "call-1",
      toolId: "orders.lookup.tool",
      input: { id: "known" },
    },
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
}
