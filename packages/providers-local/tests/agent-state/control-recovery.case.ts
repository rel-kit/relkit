/** Preserves the native control recovery state scenario. */
import { expect, test } from "vitest";
import { setup, limits } from "./fixture.js";
import { owner, operationId, future } from "./identity.js";

test("expired control recovery reconciles an admitted follow-up run", async () => {
  const fixture = await runningRecoveryThread();
  const controlId = await startRecoveryControl(fixture);
  await settleFirstRecoveryRun(fixture);
  await assertRecoveryFollowup(fixture, controlId);
});

/**
 * Creates the original first segment and physical run claim.
 * @returns The owned provider and admitted state used by the following scenario phase.
 */
async function runningRecoveryThread() {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(20),
    threadId: "control-thread",
    semanticDigest: "control-thread",
    now,
    limits,
  });
  const first = await provider.acceptRun({
    ...scope,
    operationId: operationId(21),
    semanticDigest: "first-run",
    threadId: thread.threadId,
    owner: owner(),
    input: "first",
    inputDigest: "first",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  const runClaim = await provider.claimRun({
    ...scope,
    threadId: thread.threadId,
    runId: first.runId,
    workerId: "run-worker",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  return { provider, scope, now, thread, first, runClaim };
}

/**
 * Begins the expiring control before the first run settles.
 * @param fixture - Owned provider, scope and previously admitted scenario state.
 * @returns The original follow-up control operation identity after marking its effect started.
 */
async function startRecoveryControl(fixture: Awaited<ReturnType<typeof runningRecoveryThread>>) {
  const { provider, scope, now, thread, first } = fixture;
  const controlId = operationId(22);
  await provider.acceptControl({
    ...scope,
    operationId: controlId,
    semanticDigest: "follow-up",
    threadId: thread.threadId,
    runId: first.runId,
    kind: "follow-up",
    publicPayload: "second",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits: { maxQueuedPerRun: 32, maxQueuedPerApplication: 10_000 },
  });
  const controlClaim = await provider.claimControl({
    ...scope,
    threadId: thread.threadId,
    runId: first.runId,
    operationId: controlId,
    workerId: "control-worker",
    generationId: "generation-a",
    expiresAt: new Date(Date.now() + 100).toISOString(),
  });
  await provider.markControlEffectStarted({
    ...scope,
    threadId: thread.threadId,
    runId: first.runId,
    operationId: controlId,
    claim: controlClaim,
    downstreamOperationId: controlId,
  });
  return controlId;
}

/**
 * Preserves intermediate thread readiness across segment completion.
 * @param fixture - Owned provider, scope and previously admitted scenario state.
 * @returns After the scenario persistence and behavior assertions complete.
 */
async function settleFirstRecoveryRun(fixture: Awaited<ReturnType<typeof runningRecoveryThread>>) {
  const { provider, scope, now, thread, first, runClaim } = fixture;
  await provider.completeRun({
    ...scope,
    operationId: operationId(23),
    semanticDigest: "first-complete",
    threadId: thread.threadId,
    runId: first.runId,
    claim: runClaim,
    outcome: "succeeded",
    terminalRecord: {
      recordId: "first-terminal",
      runId: first.runId,
      kind: "terminal",
      publicValue: null,
      encodedBytes: 4,
      createdAt: now,
    },
    settledAt: now,
    receiptExpiresAt: future(30),
  });
  const betweenSegments = await provider.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(betweenSegments.thread.status).toBe("running");
  expect(betweenSegments.currentRuns.find((item) => item.runId === first.runId)?.status).toBe(
    "succeeded",
  );
}

/**
 * Confirms the exact operation reconciles to its admitted follow-up run.
 * @param fixture - Owned provider, scope and previously admitted scenario state.
 * @param controlId - Original follow-up operation identity used for reconciliation.
 * @returns After the scenario persistence and behavior assertions complete.
 */
async function assertRecoveryFollowup(
  fixture: Awaited<ReturnType<typeof runningRecoveryThread>>,
  controlId: ReturnType<typeof operationId>,
) {
  const { provider, scope, now, thread } = fixture;
  await provider.acceptRun({
    ...scope,
    operationId: controlId,
    semanticDigest: "follow-up",
    threadId: thread.threadId,
    owner: owner(),
    input: "second",
    inputDigest: "second",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  await new Promise((resolve) => setTimeout(resolve, 110));
  const snapshot = await provider.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot.controls).toMatchObject([{ status: "applied", effect: "confirmed" }]);
  expect(snapshot.currentRuns).toHaveLength(2);
  expect(snapshot.currentRuns[0]?.status).toBe("succeeded");
  expect(snapshot.thread.status).toBe("running");
}
