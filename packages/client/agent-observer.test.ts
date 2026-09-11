import { expect, test } from "bun:test";
import type { AgentBase } from "./src/react/agent-hook-types.ts";
import { emptyAgentContent } from "./src/react/agent-observation.ts";
import { restoreAndObserve } from "./src/react/agent-observer.ts";
import type { AgentObservation, JournalCheckpoint, ThreadSnapshot } from "@relkit/contracts";

test("reconnects from the last cursor and replaces a declared gap with its snapshot", async () => {
  const controller = new AbortController();
  let calls = 0;
  let state: AgentBase<unknown> = {
    ...emptyAgentContent(),
    status: "idle",
    events: [],
    executions: [],
  };
  const initial = snapshot("0");
  const recovered = { ...snapshot("2"), values: { recovered: true } };
  const client = { "relkit.agent.load": async () => initial };
  const streamClient = {
    "relkit.agent.observe": async (input: unknown) => {
      calls += 1;
      const after = (input as { after: JournalCheckpoint }).after;
      if (calls === 1) {
        expect(after.sequence).toBe("0");
        return failedStream();
      }
      expect(after.sequence).toBe("1");
      return recoveredStream(recovered, controller);
    },
  };

  await restoreAndObserve(
    client,
    streamClient,
    "agent-1",
    "thread-1",
    undefined,
    controller.signal,
    (value) => {
      state = typeof value === "function" ? value(state) : value;
    },
  );

  expect(calls).toBe(2);
  expect(state.values).toEqual({ recovered: true });
  expect(state.events).toHaveLength(1);
  expect(state.snapshot?.checkpoint.sequence).toBe("2");
});

test("stops reconnecting after a terminal run-finished observation", async () => {
  const controller = new AbortController();
  let calls = 0;
  let state: AgentBase<{ answer: string }> = {
    ...emptyAgentContent(),
    status: "idle",
    events: [],
    executions: [],
  };
  const client = { "relkit.agent.load": async () => runningSnapshot("0") };
  const streamClient = {
    "relkit.agent.observe": async () => {
      calls += 1;
      if (calls > 1) controller.abort();
      return finishedStream();
    },
  };

  await restoreAndObserve(
    client,
    streamClient,
    "agent-1",
    "thread-1",
    undefined,
    controller.signal,
    (value) => {
      state = typeof value === "function" ? value(state) : value;
    },
  );

  expect(calls).toBe(1);
  expect(state.status).toBe("succeeded");
  expect(state.output).toEqual({ answer: "done" });
  expect(state.snapshot?.checkpoint.sequence).toBe("1");
  expect(state.snapshot?.activeRun).toBeUndefined();
  expect(state.snapshot?.currentRuns[0]).toMatchObject({
    runId: "run-1",
    status: "succeeded",
    outcome: "succeeded",
    settledAt: "2026-01-01T00:00:01.000Z",
  });
});

async function* failedStream(): AsyncIterable<AgentObservation> {
  yield {
    kind: "event",
    event: {
      eventId: "event-1",
      recordId: "record-1",
      runId: "run-1",
      checkpoint: checkpoint("1"),
      createdAt: "2026-01-01T00:00:01.000Z",
      kind: "execution-event",
      value: {
        nativeSequence: 1,
        kind: "values",
        scope: [],
        occurredAt: "2026-01-01T00:00:01.000Z",
        value: { live: true },
      },
    },
  };
  throw new TypeError("connection lost");
}

async function* finishedStream(): AsyncIterable<AgentObservation> {
  yield {
    kind: "event",
    event: {
      eventId: "terminal-1",
      recordId: "record-terminal-1",
      runId: "run-1",
      checkpoint: checkpoint("1"),
      createdAt: "2026-01-01T00:00:01.000Z",
      kind: "run-finished",
      value: { outcome: "succeeded", output: { answer: "done" } },
    },
  };
}

async function* recoveredStream(
  value: ThreadSnapshot,
  controller: AbortController,
): AsyncIterable<AgentObservation> {
  yield { kind: "gap", reason: "expired", snapshot: value };
  controller.abort();
}

function snapshot(sequence: string): ThreadSnapshot {
  return {
    snapshotId: `snapshot-${sequence}`,
    thread: {
      threadId: "thread-1",
      agentId: "agent-1",
      ownerScope: "owner",
      status: "idle",
      revision: sequence,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    activeRun: undefined,
    currentRuns: [],
    currentMessages: [],
    executions: [],
    approvals: [],
    controls: [],
    checkpoint: checkpoint(sequence),
    providerEpoch: "epoch-1",
    hasOlderHistory: false,
  };
}

function runningSnapshot(sequence: string): ThreadSnapshot {
  const run = {
    runId: "run-1",
    threadId: "thread-1",
    owner: {
      generationId: "generation-1",
      publicFingerprint: "sha256:public",
      protocolVersion: 2,
      schemaVersion: 2,
      providerScope: "default",
    },
    operationId: "operation-1" as ThreadSnapshot["currentRuns"][number]["operationId"],
    status: "running" as const,
    inputDigest: "sha256:input",
    acceptedAt: "2026-01-01T00:00:00.000Z",
  };
  return { ...snapshot(sequence), activeRun: run, currentRuns: [run] };
}

function checkpoint(sequence: string): JournalCheckpoint {
  return {
    applicationId: "fixture",
    environment: "test",
    profile: "default",
    providerEpoch: "epoch-1",
    threadId: "thread-1",
    sequence,
  };
}
