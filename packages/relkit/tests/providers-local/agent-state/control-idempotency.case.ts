/** Preserves the native control idempotency state scenario. */
import { expect, test } from "vitest";
import { setup, limits } from "./fixture.js";
import { owner, operationId, future } from "./identity.js";

test("control receipts remain idempotent after the active run settles", async () => {
  const { provider, scope, now, thread, run, claim } = await runningControlledThread();
  const control = {
    ...scope,
    operationId: operationId(6),
    semanticDigest: "stop-control",
    threadId: thread.threadId,
    runId: run.runId,
    kind: "stop" as const,
    publicPayload: { mode: "graceful" },
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits: { maxQueuedPerRun: 32, maxQueuedPerApplication: 10_000 },
  };
  const first = await provider.acceptControl(control);
  await provider.completeRun({
    ...scope,
    operationId: operationId(7),
    semanticDigest: "completion",
    threadId: thread.threadId,
    runId: run.runId,
    claim,
    outcome: "succeeded",
    terminalRecord: {
      recordId: "terminal",
      runId: run.runId,
      kind: "terminal",
      publicValue: null,
      encodedBytes: 4,
      createdAt: now,
    },
    settledAt: now,
    receiptExpiresAt: future(30),
  });
  expect(await provider.acceptControl(control)).toEqual({ ...first, duplicate: true });
});

/**
 * Creates the exact native control idempotency fixture.
 * @returns The owned provider and admitted state used by the following scenario phase.
 */
async function runningControlledThread() {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(4),
    threadId: "settled-control-thread",
    semanticDigest: "thread",
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operationId(5),
    semanticDigest: "run",
    threadId: thread.threadId,
    owner: owner(),
    input: null,
    inputDigest: "null",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    workerId: "worker",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  return { provider, scope, now, thread, run, claim };
}
