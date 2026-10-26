/** Checks native AG-UI gap recovery projections independently of replay resource acquisition. */
import { expect, test } from "vitest";
import { EventSchemas, EventType } from "@ag-ui/core";
import type { ThreadSnapshot } from "@relkit/agents";
import { createOperationId } from "@relkit/realtime";
import { snapshotFrames } from "../src/agent-protocol-frame-state.js";
import { agUiFrames } from "../src/agent-protocol-encoding.js";
const acceptedAt = "2026-01-01T00:00:00.000Z";
const owner = {
  generationId: "generation-1",
  publicFingerprint: "sha256:public",
  protocolVersion: 1,
  schemaVersion: 1,
  providerScope: "default",
};
const snapshot: ThreadSnapshot = {
  snapshotId: "snapshot-1",
  thread: {
    threadId: "thread-1",
    agentId: "support.echo",
    ownerScope: "viewer",
    status: "running",
    revision: "1",
    createdAt: acceptedAt,
    updatedAt: acceptedAt,
  },
  activeRun: { runId: "run-1", threadId: "thread-1", owner },
  values: { todos: [{ content: "Recover", status: "pending" }] },
  executions: [
    {
      scope: ["tools:delegate"],
      agent: "researcher",
      values: { phase: "collecting" },
      status: "running",
      lastEventSequence: 7,
    },
  ],
  currentRuns: [
    {
      runId: "run-1",
      threadId: "thread-1",
      owner,
      operationId: createOperationId(),
      status: "running",
      inputDigest: "sha256:input",
      acceptedAt,
    },
  ],
  currentMessages: [],
  approvals: [],
  controls: [],
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
test("AG-UI gap recovery projects root values and nested execution snapshots", () => {
  const projected = [
    ...snapshotFrames(snapshot, new Set(["run-1"]), new Map(), new Map(), new Map(), true),
  ].flatMap((frame) => [...agUiFrames(frame)].map((event) => EventSchemas.parse(event)));
  expect(projected).toEqual([
    { type: EventType.STATE_SNAPSHOT, snapshot: snapshot.values },
    {
      type: EventType.CUSTOM,
      name: "relkit.execution-snapshot",
      value: snapshot.executions[0],
    },
  ]);
});
