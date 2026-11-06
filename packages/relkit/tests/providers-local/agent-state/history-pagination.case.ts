/** Preserves the native history pagination state scenario. */
import { expect, test } from "vitest";
import { setup, limits } from "./fixture.js";
import { owner, operationId, future } from "./identity.js";

test("thread snapshots pin bounded older history for authenticated pagination", async () => {
  const { provider, scope, now, thread, run, claim } = await runningHistoryThread();
  for (let index = 0; index < 3; index += 1) {
    const message = {
      messageId: `message-${index}`,
      role: "assistant" as const,
      parts: [{ partId: `part-${index}`, kind: "text" as const, text: "x".repeat(700) }],
      createdAt: now,
    };
    await provider.appendJournal({
      ...scope,
      threadId: thread.threadId,
      runId: run.runId,
      claim,
      operationId: operationId(9 + index),
      semanticDigest: `message-${index}`,
      record: {
        recordId: `record-${index}`,
        runId: run.runId,
        kind: "message",
        publicValue: message,
        encodedBytes: JSON.stringify(message).length,
        createdAt: now,
      },
      limits,
    });
  }
  const snapshot = await provider.loadThread({
    ...scope,
    threadId: thread.threadId,
    maxEncodedBytes: 1_800,
  });
  expect(snapshot.hasOlderHistory).toBe(true);
  const history = await provider.readSnapshotHistory({
    ...scope,
    threadId: thread.threadId,
    snapshotId: snapshot.snapshotId,
    cursor: snapshot.olderHistoryCursor!,
    maxEncodedBytes: limits.maxHistoryPageBytes,
  });
  expect([...history.messages, ...snapshot.currentMessages]).toHaveLength(3);
});

/**
 * Creates the exact native history pagination fixture.
 * @returns The owned provider and admitted state used by the following scenario phase.
 */
async function runningHistoryThread() {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(7),
    threadId: "history-thread",
    semanticDigest: "thread-history",
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operationId(8),
    semanticDigest: "run-history",
    threadId: thread.threadId,
    owner: owner(),
    input: null,
    inputDigest: "input",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    workerId: "history-worker",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  return { provider, scope, now, thread, run, claim };
}
