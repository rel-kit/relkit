/** Preserves the native waiting revision state scenario. */
import { expect, test } from "vitest";
import { setup, createWaitingRun, limits } from "./fixture.js";
import { operationId, future, digest } from "./identity.js";

test("an older waiting revision cannot resume a newer interruption", async () => {
  const { provider, scope, first, admittedAt, second } = await repeatedInterruption();
  await expect(
    provider.admitContinuation({
      ...scope,
      kind: "resume",
      operationId: operationId(135),
      semanticDigest: "stale-first-resume",
      threadId: "repeated-wait",
      interruptedRunId: first.runId,
      interruptSetDigest: digest(first.waiting),
      waitingRevision: first.waiting.revision,
      admittedAt,
      receiptExpiresAt: future(30),
    }),
  ).rejects.toMatchObject({ code: "STALE_CONTINUATION" });
  expect(
    (
      await provider.loadThread({
        ...scope,
        threadId: "repeated-wait",
        maxEncodedBytes: limits.maxSnapshotBytes,
      })
    ).waiting,
  ).toEqual(second.waiting);
});

/**
 * Creates the exact native waiting revision fixture.
 * @returns The owned provider and admitted state used by the following scenario phase.
 */
async function repeatedInterruption() {
  const { provider, scope } = await setup();
  const first = await createWaitingRun(provider, scope, "repeated-wait", 130);
  const admittedAt = new Date().toISOString();
  const resumed = await provider.admitContinuation({
    ...scope,
    kind: "resume",
    operationId: operationId(133),
    semanticDigest: "first-resume",
    threadId: "repeated-wait",
    interruptedRunId: first.runId,
    interruptSetDigest: digest(first.waiting),
    waitingRevision: first.waiting.revision,
    admittedAt,
    receiptExpiresAt: future(30),
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId: "repeated-wait",
    runId: resumed.runId,
    workerId: "second-worker",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  const second = await provider.suspendRun({
    ...scope,
    operationId: operationId(134),
    threadId: "repeated-wait",
    runId: resumed.runId,
    claim,
    waiting: {
      runId: resumed.runId,
      response: { type: "string" },
      requests: [{ node: "second-review", response: { type: "string" } }],
    },
    suspendedAt: admittedAt,
  });
  return { provider, scope, first, admittedAt, second };
}
