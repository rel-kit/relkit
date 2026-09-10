import { expect, test } from "bun:test";
import {
  AGENT_STATE_SCHEMA_VERSION,
  AGENT_STREAM_VERSION,
  type ThreadSnapshot,
} from "@relkit/contracts";
import { assertAgentRunWritable, clientAgentSnapshot } from "./src/agent-compatibility.ts";

test("historical AI SDK snapshots are inspectable but not resumable", () => {
  const projected = clientAgentSnapshot(snapshot(1, 1));
  expect(projected.currentRuns).toHaveLength(1);
  expect(projected.waiting).toBeUndefined();
  expect(projected.compatibility).toEqual({
    runtime: "ai-sdk",
    access: "read-only",
    resumableCheckpoint: false,
    protocolVersion: 1,
    schemaVersion: 1,
  });
  expect(() => assertAgentRunWritable(snapshot(1, 1), "run-1")).toThrow(
    expect.objectContaining({ code: "AGENT_RUN_READ_ONLY" }),
  );
});

test("historical snapshots without owner versions remain safely read-only", () => {
  const historical = snapshot(1, 1);
  const run = historical.currentRuns[0];
  if (run === undefined) throw new Error("Expected a fixture run.");
  const projected = clientAgentSnapshot({
    ...historical,
    currentRuns: [{ ...run, owner: undefined } as unknown as typeof run],
  });
  expect(projected.compatibility).toEqual({
    runtime: "ai-sdk",
    access: "read-only",
    resumableCheckpoint: false,
  });
  expect(() => assertAgentRunWritable(projected, "run-1")).toThrow(
    expect.objectContaining({ code: "AGENT_RUN_READ_ONLY" }),
  );
});

test("current native waiting snapshots retain their resume claim", () => {
  const projected = clientAgentSnapshot(snapshot(AGENT_STREAM_VERSION, AGENT_STATE_SCHEMA_VERSION));
  expect(projected.waiting?.runId).toBe("run-1");
  expect(projected.compatibility).toMatchObject({
    runtime: "native",
    access: "read-write",
    resumableCheckpoint: true,
  });
  expect(() => assertAgentRunWritable(projected, "run-1")).not.toThrow();
});

function snapshot(protocolVersion: number, schemaVersion: number): ThreadSnapshot {
  const owner = {
    generationId: "generation-a",
    publicFingerprint: "sha256:public",
    protocolVersion,
    schemaVersion,
    providerScope: "default",
  };
  return {
    snapshotId: "snapshot-1",
    thread: {
      threadId: "thread-1",
      agentId: "support.echo",
      ownerScope: "viewer",
      status: "waiting",
      revision: "1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    activeRun: { runId: "run-1", threadId: "thread-1", owner },
    currentRuns: [
      {
        runId: "run-1",
        threadId: "thread-1",
        owner,
        operationId: "019bffff-ffff-7fff-bfff-ffffffffffff" as never,
        status: "waiting",
        inputDigest: "sha256:input",
        acceptedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    currentMessages: [],
    executions: [],
    approvals: [],
    controls: [],
    waiting: { revision: "1", runId: "run-1", response: {}, requests: [] },
    checkpoint: {
      applicationId: "fixture",
      environment: "test",
      profile: "default",
      providerEpoch: "epoch-1",
      threadId: "thread-1",
      sequence: "1",
    },
    providerEpoch: "epoch-1",
    hasOlderHistory: false,
  };
}
