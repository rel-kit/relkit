import { expect, test } from "bun:test";
import { agentClientEvents, type JournalRecord, type ToolPartState } from "./src/index.ts";

test("projects durable tool states into explicit client lifecycle events", () => {
  const states: readonly ToolPartState[] = [
    "started",
    "input-streaming",
    "input-ready",
    "approval-required",
    "running",
    "succeeded",
    "failed",
    "denied",
  ];
  const kinds = states.flatMap((state, index) =>
    agentClientEvents(record(state, index)).map((event) => event.kind),
  );
  expect(kinds).toEqual([
    "tool-started",
    "tool-input",
    "tool-input-ready",
    "tool-approval-required",
    "tool-executing",
    "tool-succeeded",
    "tool-failed",
    "tool-denied",
  ]);
});

test("preserves tool identity on progress events", () => {
  const event = agentClientEvents({
    ...record("running", 9),
    publicValue: {
      messageId: "tool-progress",
      role: "tool",
      parts: [
        {
          partId: "call-1:progress",
          kind: "progress",
          scope: "tool",
          toolCallId: "call-1",
          toolId: "orders.lookup",
          value: { stage: "lookup" },
        },
      ],
      createdAt: new Date(9).toISOString(),
    },
  })[0];
  expect(event).toMatchObject({
    kind: "progress",
    scope: "tool",
    progressId: "call-1:progress",
    toolCallId: "call-1",
    toolId: "orders.lookup",
    value: { stage: "lookup" },
  });
});

function record(state: ToolPartState, index: number): JournalRecord {
  const createdAt = new Date(index).toISOString();
  return {
    recordId: `record-${index}`,
    runId: "run-1",
    kind: "message",
    publicValue: {
      messageId: "tool-message",
      role: "tool",
      parts: [
        {
          partId: "tool-state",
          kind: "tool",
          toolCallId: "call-1",
          toolId: "orders.lookup",
          state,
          value: state === "input-streaming" ? '{"id":' : { id: "one" },
        },
      ],
      createdAt,
    },
    checkpoint: {
      applicationId: "fixture",
      environment: "test",
      profile: "default",
      providerEpoch: "epoch-1",
      threadId: "thread-1",
      sequence: String(index),
    },
    encodedBytes: 1,
    createdAt,
  };
}
