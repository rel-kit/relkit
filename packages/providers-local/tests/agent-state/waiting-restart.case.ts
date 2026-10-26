/** Preserves the native waiting restart state scenario. */
import { expect, test } from "vitest";
import { setup, limits } from "./fixture.js";
import { owner, operationId, future, digest } from "./identity.js";
import { createLocalAgentStateProvider } from "../../src/agent-state/provider.js";

test("waiting publication is atomic and remains stable across provider restart", async () => {
  const fixture = await runningWaitingThread();
  const published = await publishWaiting(fixture);
  const restarted = await assertRestartedWaiting(fixture, published);
  await assertStaleWaitingWrite(fixture, restarted);
  await assertWaitingContinuation(fixture, published, restarted);
});

/**
 * Creates the original running segment before its interruption.
 * @returns The owned provider and admitted state used by the following scenario phase.
 */
async function runningWaitingThread() {
  const { provider, root, scope } = await setup();
  const now = new Date().toISOString();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(80),
    threadId: "waiting-thread",
    semanticDigest: "waiting-thread",
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operationId(81),
    semanticDigest: "waiting-run",
    threadId: thread.threadId,
    owner: owner(),
    input: { orderId: "order-1" },
    inputDigest: "waiting-input",
    acceptedAt: new Date(Date.now() - 60_000).toISOString(),
    receiptExpiresAt: future(30),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    workerId: "waiting-worker",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  return { provider, root, scope, now, thread, run, claim };
}

/**
 * Publishes the exact waiting contract and retains its receipt.
 * @param fixture - Owned provider, scope and previously admitted scenario state.
 * @returns The exact waiting contract and persisted suspension receipt.
 */
async function publishWaiting(fixture: Awaited<ReturnType<typeof runningWaitingThread>>) {
  const { provider, scope, now, thread, run, claim } = fixture;
  const waiting = {
    runId: run.runId,
    response: { type: "boolean" },
    requests: [{ node: "review", value: { total: 42 }, response: { type: "boolean" } }],
  } as const;
  const receipt = await provider.suspendRun({
    ...scope,
    operationId: operationId(82),
    threadId: thread.threadId,
    runId: run.runId,
    claim,
    waiting,
    suspendedAt: now,
  });
  return { waiting, receipt };
}

/**
 * Confirms the journal and snapshot survive a physical provider restart.
 * @param fixture - Owned provider, scope and previously admitted scenario state.
 * @param published - Waiting contract and receipt obtained before reopening the provider.
 * @returns The reopened provider after its durable waiting snapshot and journal assertions pass.
 */
async function assertRestartedWaiting(
  fixture: Awaited<ReturnType<typeof runningWaitingThread>>,
  published: Awaited<ReturnType<typeof publishWaiting>>,
) {
  const { root, scope, thread, run } = fixture;
  const { waiting, receipt } = published;
  expect(receipt).toMatchObject({
    status: "waiting",
    waiting: { ...waiting, revision: "2" },
    checkpoint: { sequence: "1" },
  });
  const restarted = createLocalAgentStateProvider(root, { pollingMs: 50 });
  const snapshot = await restarted.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot).toMatchObject({
    thread: { status: "waiting", revision: "2" },
    activeRun: { runId: run.runId },
    currentRuns: [{ runId: run.runId, status: "waiting" }],
    waiting: { ...waiting, revision: "2" },
    checkpoint: { sequence: "1" },
  });
  const journal = await restarted.readJournal({
    ...scope,
    threadId: thread.threadId,
    after: { ...snapshot.checkpoint, sequence: "0" },
    limit: 10,
    maxEncodedBytes: 1024,
  });
  expect(journal.records).toMatchObject([
    { runId: run.runId, kind: "interruption", publicValue: { ...waiting, revision: "2" } },
  ]);
  return restarted;
}

/**
 * Retains rejection of the executor claim that preceded suspension.
 * @param fixture - Owned provider, scope and previously admitted scenario state.
 * @param restarted - Provider reopened on the same owned state directory.
 * @returns After the scenario persistence and behavior assertions complete.
 */
async function assertStaleWaitingWrite(
  fixture: Awaited<ReturnType<typeof runningWaitingThread>>,
  restarted: ReturnType<typeof createLocalAgentStateProvider>,
) {
  const { scope, thread, run, claim, now } = fixture;
  await expect(
    restarted.appendJournal({
      ...scope,
      threadId: thread.threadId,
      runId: run.runId,
      claim,
      operationId: operationId(83),
      semanticDigest: "stale-write",
      record: {
        recordId: "stale-write",
        runId: run.runId,
        kind: "progress",
        publicValue: null,
        encodedBytes: 4,
        createdAt: now,
      },
      limits,
    }),
  ).rejects.toMatchObject({ code: "CLAIM_LOST" });
}

/**
 * Confirms duplicate continuation admission produces only one resumed segment.
 * @param fixture - Owned provider, scope and previously admitted scenario state.
 * @param published - Waiting contract and receipt obtained before reopening the provider.
 * @param restarted - Provider reopened on the same owned state directory.
 * @returns After the scenario persistence and behavior assertions complete.
 */
async function assertWaitingContinuation(
  fixture: Awaited<ReturnType<typeof runningWaitingThread>>,
  published: Awaited<ReturnType<typeof publishWaiting>>,
  restarted: ReturnType<typeof createLocalAgentStateProvider>,
) {
  const { scope, thread, run, now } = fixture;
  const { waiting } = published;
  const waitingState = { ...waiting, revision: "2" };
  const continuationRequest = {
    ...scope,
    kind: "resume" as const,
    operationId: operationId(85),
    semanticDigest: "resume-false-at-revision-2",
    threadId: thread.threadId,
    interruptedRunId: run.runId,
    interruptSetDigest: digest(waitingState),
    waitingRevision: "2",
    admittedAt: now,
    receiptExpiresAt: future(30),
  };
  const continuation = await restarted.admitContinuation(continuationRequest);
  const duplicate = await restarted.admitContinuation(continuationRequest);
  const resumed = await restarted.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(continuation).toMatchObject({ waitingRevision: "2", duplicate: false });
  expect(duplicate).toEqual({ ...continuation, duplicate: true });
  expect(resumed).toMatchObject({
    thread: { status: "running", revision: "3" },
    currentRuns: [{ status: "waiting" }, { runId: continuation.runId, status: "accepted" }],
  });
  expect(resumed.waiting).toBeUndefined();
}
