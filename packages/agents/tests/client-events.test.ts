import { expect, test } from "vitest";
import { Effect, Metric, Tracer } from "effect";
import {
  agentClientEvents,
  agentClientEventsEffect,
  type JournalRecord,
  type ToolPartState,
} from "../src/index.ts";

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

test("projects through the Effect path with a stable span and metric", () => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  const result = Effect.runSync(
    Effect.withTracer(
      Effect.gen(function* () {
        const before = yield* Metric.snapshot;
        const events = yield* agentClientEventsEffect(record("started", 1));
        const after = yield* Metric.snapshot;
        return { before, after, events };
      }),
      tracer,
    ),
  );
  expect(result.events).toEqual(agentClientEvents(record("started", 1)));
  expect(spans.map(({ name }) => name)).toContain("Agents.clientEvents.project");
  expect(metricCount(result.after, "relkit.agents.client_events.project.total")).toBe(
    metricCount(result.before, "relkit.agents.client_events.project.total") + 1,
  );
});

function metricCount(snapshot: Metric.Snapshot[], name: string): number {
  const state = snapshot.find((metric) => metric.id === name)?.state;
  return state !== undefined && "count" in state && typeof state.count === "number"
    ? state.count
    : 0;
}

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
