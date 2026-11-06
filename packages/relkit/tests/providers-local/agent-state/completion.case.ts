/** Preserves the native completion state scenario. */
import { expect, test } from "vitest";
import { setup, limits } from "./fixture.js";
import { owner, operationId, future } from "./identity.js";

test("completion receipt wins after claim release and terminal state is atomic", async () => {
  const { provider, scope, now, created, accepted, claim } = await runningCompletion();
  const request = {
    ...scope,
    operationId: operationId(3),
    semanticDigest: "completion",
    threadId: created.threadId,
    runId: accepted.runId,
    claim,
    outcome: "succeeded" as const,
    terminalRecord: {
      recordId: "terminal",
      runId: accepted.runId,
      kind: "terminal" as const,
      publicValue: { answer: "done" },
      encodedBytes: 100,
      createdAt: now,
    },
    settledAt: now,
    receiptExpiresAt: future(30),
  };
  const first = await provider.completeRun(request);
  const retry = await provider.completeRun(request);
  expect(retry).toEqual({ ...first, duplicate: true });
  const snapshot = await provider.loadThread({
    ...scope,
    threadId: created.threadId,
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot.thread.status).toBe("idle");
  expect(snapshot.currentRuns[0]?.status).toBe("succeeded");
  expect(snapshot.executions).toEqual([]);
  expect(
    (
      await provider.readJournal({
        ...scope,
        threadId: created.threadId,
        after: { ...snapshot.checkpoint, sequence: "0" },
        limit: 10,
        maxEncodedBytes: 1024,
      })
    ).records,
  ).toHaveLength(1);
});

/**
 * Creates the exact native completion fixture.
 * @returns The owned provider and admitted state used by the following scenario phase.
 */
async function runningCompletion() {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  const created = await provider.createThread({
    ...scope,
    operationId: operationId(1),
    threadId: "completion-thread",
    semanticDigest: "thread",
    now,
    limits,
  });
  const accepted = await provider.acceptRun({
    ...scope,
    operationId: operationId(2),
    semanticDigest: "run",
    threadId: created.threadId,
    owner: owner(),
    input: { message: "hello" },
    inputDigest: "input",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId: created.threadId,
    runId: accepted.runId,
    workerId: "worker",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  return { provider, scope, now, created, accepted, claim };
}
