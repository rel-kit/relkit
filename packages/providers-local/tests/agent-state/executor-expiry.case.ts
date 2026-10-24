/** Preserves the native executor expiry state scenario. */
import { expect, test } from "vitest";
import { setup, limits } from "./fixture.js";
import { owner, operationId, future } from "./identity.js";

test("provider observation records interruption after executor claim expiry", async () => {
  const { provider, scope, now, thread, run } = await expiredExecutor();
  const snapshot = await provider.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot.thread.status).toBe("worker-interrupted");
  expect(snapshot.currentRuns).toMatchObject([
    { runId: run.runId, status: "worker-interrupted", outcome: "worker-interrupted" },
  ]);
  const journal = await provider.readJournal({
    ...scope,
    threadId: thread.threadId,
    after: { ...snapshot.checkpoint, sequence: "0" },
    limit: 10,
    maxEncodedBytes: 1024,
  });
  expect(journal.records).toMatchObject([
    { runId: run.runId, kind: "interruption", publicValue: { reason: "claim-expired" } },
  ]);
});

/**
 * Creates the exact native executor expiry fixture.
 * @returns The owned provider and admitted state used by the following scenario phase.
 */
async function expiredExecutor() {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(40),
    threadId: "expired-claim-thread",
    semanticDigest: "expired-thread",
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operationId(41),
    semanticDigest: "expired-run",
    threadId: thread.threadId,
    owner: owner(),
    input: null,
    inputDigest: "input",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  await provider.claimRun({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    workerId: "dead-worker",
    generationId: "generation-a",
    expiresAt: new Date(Date.now() - 1).toISOString(),
  });
  return { provider, scope, now, thread, run };
}
