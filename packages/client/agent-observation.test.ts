import { expect, test } from "bun:test";
import type {
  AgentClientEvent,
  AgentExecutionEvent,
  BrowserMessage,
  JournalCheckpoint,
  ThreadSnapshot,
} from "@relkit/contracts";
import { agentContentFromMessages, applyAgentEvent } from "./src/react/agent-observation.ts";
import type { AgentBase } from "./src/react/agent-hook-types.ts";
import { applyAgentSnapshot } from "./src/react/agent-snapshot-observation.ts";

const checkpoint: JournalCheckpoint = {
  applicationId: "fixture",
  environment: "test",
  profile: "default",
  providerEpoch: "epoch-1",
  threadId: "thread-1",
  sequence: "1",
};

test("keeps an ordered timeline and direct indexes while tool state changes", () => {
  const messages: BrowserMessage[] = [
    {
      messageId: "message-1",
      runId: "run-1",
      role: "user",
      parts: [{ partId: "message-1:text", kind: "text", text: "Where is it?" }],
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      messageId: "tool-message-1",
      runId: "run-1",
      role: "tool",
      parts: [
        {
          partId: "tool-part-1",
          kind: "tool",
          toolCallId: "tool-call-1",
          toolId: "orders.lookup",
          state: "started",
        },
      ],
      createdAt: "2026-01-01T00:00:01.000Z",
    },
    {
      messageId: "progress-message-1",
      runId: "run-1",
      role: "tool",
      parts: [
        {
          partId: "progress-1",
          kind: "progress",
          scope: "tool",
          toolCallId: "tool-call-1",
          toolId: "orders.lookup",
          value: { stage: "lookup" },
        },
      ],
      createdAt: "2026-01-01T00:00:02.000Z",
    },
  ];
  const content = agentContentFromMessages(messages);
  const state = { ...content, status: "running" as const, events: [], executions: [] };
  const next = applyAgentEvent(state, toolEvent("tool-succeeded", { orderId: "one" }));

  expect(next.timeline.map((item) => item.kind)).toEqual(["message", "tool", "progress"]);
  expect(next.messages).toHaveLength(1);
  expect(next.toolCallsById.get("tool-call-1")).toMatchObject({
    state: "succeeded",
    output: { orderId: "one" },
  });
  expect(next.timelineById.get("tool:tool-call-1")).toMatchObject({
    kind: "tool",
    toolCall: { state: "succeeded" },
  });
  expect(next.progressById.get("progress-1")).toMatchObject({
    scope: "tool",
    toolCallId: "tool-call-1",
    toolId: "orders.lookup",
    value: { stage: "lookup" },
  });
});

test("reduces root values, nested execution, terminal output, and replay once", () => {
  let state: AgentBase<{ answer: string }> = {
    ...agentContentFromMessages([]),
    status: "running",
    events: [],
    executions: [],
  };
  state = applyAgentEvent(state, executionEvent("values-1", 1, [], { todos: ["pending"] }));
  state = applyAgentEvent(state, executionEvent("values-2", 2, [], { phase: "working" }));
  const nested = executionEvent("values-3", 3, ["tools:delegate"], { todos: ["child"] });
  state = applyAgentEvent(state, nested);

  expect(state.values).toEqual({ todos: ["pending"], phase: "working" });
  expect(state.output).toBeUndefined();
  expect(state.executions).toEqual([
    expect.objectContaining({
      scope: ["tools:delegate"],
      status: "running",
      values: { todos: ["child"] },
    }),
  ]);
  expect(applyAgentEvent(state, nested)).toBe(state);

  state = applyAgentEvent(
    state,
    nativeEvent("custom", 4, "custom", [], {
      name: "notice",
      data: { message: "ready" },
    }),
  );
  expect(state.events.at(-1)).toMatchObject({
    kind: "custom",
    name: "notice",
    data: { message: "ready" },
  });

  state = applyAgentEvent(state, terminalEvent("terminal", { answer: "done" }));
  expect(state.status).toBe("succeeded");
  expect(state.output).toEqual({ answer: "done" });
  state = applyAgentEvent(state, failedTerminalEvent("failed-terminal"));
  expect(state.status).toBe("failed");
  expect(state.output).toBeUndefined();
});

test("restores canonical output and values with terminal status", () => {
  const state: AgentBase<{ answer: string }> = {
    ...agentContentFromMessages([]),
    status: "loading",
    events: [],
    executions: [],
  };
  const snapshot = {
    snapshotId: "snapshot-1",
    thread: {
      threadId: "thread-1",
      agentId: "agent-1",
      ownerScope: "owner",
      status: "idle",
      revision: "2",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:05.000Z",
    },
    activeRun: undefined,
    currentRuns: [{ status: "succeeded", acceptedAt: "2026-01-01T00:00:01.000Z" }],
    currentMessages: [],
    values: { todos: ["completed"] },
    output: { answer: "done" },
    executions: [],
    approvals: [],
    controls: [],
    checkpoint,
    providerEpoch: "epoch-1",
    hasOlderHistory: false,
  } as unknown as ThreadSnapshot;

  expect(applyAgentSnapshot(state, snapshot)).toMatchObject({
    status: "succeeded",
    threadId: "thread-1",
    values: { todos: ["completed"] },
    output: { answer: "done" },
  });
});

function toolEvent(kind: "tool-succeeded", output: unknown): AgentClientEvent {
  return {
    eventId: "event-1",
    recordId: "record-1",
    runId: "run-1",
    checkpoint,
    createdAt: "2026-01-01T00:00:03.000Z",
    kind,
    messageId: "tool-message-1",
    partId: "tool-part-1",
    toolCallId: "tool-call-1",
    toolId: "orders.lookup",
    output,
  };
}

function executionEvent(
  eventId: string,
  nativeSequence: number,
  scope: readonly string[],
  value: unknown,
): AgentClientEvent {
  return nativeEvent(eventId, nativeSequence, "values", scope, value);
}

function nativeEvent(
  eventId: string,
  nativeSequence: number,
  kind: string,
  scope: readonly string[],
  value: unknown,
): AgentClientEvent {
  return {
    eventId,
    recordId: eventId,
    runId: "run-1",
    checkpoint: { ...checkpoint, sequence: String(nativeSequence) },
    createdAt: "2026-01-01T00:00:03.000Z",
    kind: "execution-event",
    value: {
      nativeSequence,
      kind,
      scope,
      occurredAt: "2026-01-01T00:00:03.000Z",
      value,
    } satisfies AgentExecutionEvent,
  };
}

function terminalEvent(eventId: string, output: unknown): AgentClientEvent {
  return {
    eventId,
    recordId: eventId,
    runId: "run-1",
    checkpoint: { ...checkpoint, sequence: "4" },
    createdAt: "2026-01-01T00:00:04.000Z",
    kind: "run-finished",
    value: { outcome: "succeeded", output },
  };
}

function failedTerminalEvent(eventId: string): AgentClientEvent {
  return {
    eventId,
    recordId: eventId,
    runId: "run-2",
    checkpoint: { ...checkpoint, sequence: "5" },
    createdAt: "2026-01-01T00:00:05.000Z",
    kind: "run-finished",
    value: { outcome: "failed", error: "safe" },
  };
}
