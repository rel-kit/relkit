import { describe, expect, test } from "bun:test";
import { applyAgentObservation, emptyAgentConversation } from "../app/agent-observation";
import type {
  AgentClientEvent,
  JournalCheckpoint,
  ThreadSnapshot,
} from "../app/application-runtime-types";

const checkpoint: JournalCheckpoint = {
  applicationId: "commerce",
  environment: "test",
  profile: "default",
  providerEpoch: "epoch",
  threadId: "thread-1",
  sequence: "1",
};
const base = {
  runId: "run-1",
  recordId: "record-1",
  checkpoint,
  createdAt: "2026-09-08T10:00:00.000Z",
};

describe("agent observation state", () => {
  test("updates one tool call through its full streamed lifecycle", () => {
    const events: readonly AgentClientEvent[] = [
      {
        ...base,
        eventId: "started",
        kind: "tool-started",
        messageId: "tool-message",
        partId: "part-1",
        toolCallId: "call-1",
        toolId: "orders.lookup-order",
      },
      {
        ...base,
        eventId: "input",
        kind: "tool-input-ready",
        messageId: "tool-message",
        partId: "part-1",
        toolCallId: "call-1",
        toolId: "orders.lookup-order",
        input: { orderId: "demo-1" },
      },
      {
        ...base,
        eventId: "executing",
        kind: "tool-executing",
        messageId: "tool-message",
        partId: "part-1",
        toolCallId: "call-1",
        toolId: "orders.lookup-order",
      },
      {
        ...base,
        eventId: "progress",
        kind: "progress",
        progressId: "progress-1",
        messageId: "tool-message",
        scope: "tool",
        toolCallId: "call-1",
        toolId: "orders.lookup-order",
        value: { stage: "lookup-completed" },
      },
      {
        ...base,
        eventId: "succeeded",
        kind: "tool-succeeded",
        messageId: "tool-message",
        partId: "part-1",
        toolCallId: "call-1",
        toolId: "orders.lookup-order",
        output: { orderId: "demo-1", status: "confirmed" },
      },
    ];
    const state = events.reduce(
      (current, event) => applyAgentObservation(current, { kind: "event", event }),
      emptyAgentConversation,
    );
    const message = state.messages[0]!;
    const tool = message.parts.find((part) => part.kind === "tool");
    const progress = message.parts.find((part) => part.kind === "progress");
    expect(state.messages).toHaveLength(1);
    expect(tool).toMatchObject({
      toolCallId: "call-1",
      state: "succeeded",
      input: { orderId: "demo-1" },
      output: { orderId: "demo-1", status: "confirmed" },
    });
    expect(progress).toMatchObject({
      scope: "tool",
      toolCallId: "call-1",
      value: { stage: "lookup-completed" },
    });
    expect(state.events.map((event) => event.kind)).toEqual([
      "tool-started",
      "tool-input-ready",
      "tool-executing",
      "progress",
      "tool-succeeded",
    ]);
  });

  test("merges live public values, deduplicates events, and replaces cursor gaps", () => {
    const initial = applyAgentObservation(emptyAgentConversation, {
      kind: "snapshot",
      snapshot: snapshot({ todos: [{ content: "lookup", status: "pending" }] }, "1"),
    });
    const event = {
      ...base,
      recordId: "record-values",
      eventId: "values",
      checkpoint: { ...snapshot(undefined, "2").checkpoint },
      kind: "execution-event",
      value: {
        nativeSequence: 1,
        kind: "values",
        scope: [],
        occurredAt: base.createdAt,
        value: { todos: [{ content: "lookup", status: "completed" }] },
      },
    } satisfies AgentClientEvent;
    const updated = applyAgentObservation(initial, { kind: "event", event });
    const duplicate = applyAgentObservation(updated, { kind: "event", event });
    const replaced = applyAgentObservation(duplicate, {
      kind: "gap",
      reason: "expired",
      snapshot: snapshot({ todos: [{ content: "review", status: "pending" }] }, "8"),
    });

    expect(updated.snapshot?.values).toEqual({
      todos: [{ content: "lookup", status: "completed" }],
    });
    expect(duplicate.events).toHaveLength(1);
    expect(replaced.snapshot?.checkpoint.sequence).toBe("8");
    expect(replaced.snapshot?.values).toEqual({
      todos: [{ content: "review", status: "pending" }],
    });
  });
});

function snapshot(values: unknown, sequence: string): ThreadSnapshot {
  const checkpoint = {
    applicationId: "commerce",
    environment: "test",
    profile: "default",
    providerEpoch: "epoch",
    threadId: "thread-1",
    sequence,
  };
  return {
    snapshotId: `snapshot-${sequence}`,
    thread: {
      threadId: "thread-1",
      agentId: "orders.support",
      ownerScope: "visitor",
      status: "running",
      revision: sequence,
      createdAt: base.createdAt,
      updatedAt: base.createdAt,
    },
    activeRun: undefined,
    currentRuns: [],
    currentMessages: [],
    ...(values === undefined ? {} : { values }),
    executions: [],
    approvals: [],
    controls: [],
    checkpoint,
    providerEpoch: "epoch",
    hasOlderHistory: false,
  };
}
