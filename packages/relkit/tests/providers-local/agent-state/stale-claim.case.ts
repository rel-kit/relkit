/** Preserves the native stale claim state scenario. */
import { expect, test } from "vitest";
import { setup, limits } from "./fixture.js";
import { owner, operationId, future } from "./identity.js";

test("stale interruption cannot overwrite a renewed claim", async () => {
  const { provider, scope, now, thread, run, claim } = await runningClaimedThread();
  const renewed = await provider.renewRunClaim({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    claim,
    expiresAt: future(2),
  });
  const result = await provider.interruptOwnedRun({
    ...scope,
    operationId: operationId(6),
    threadId: thread.threadId,
    runId: run.runId,
    expectedOwner: owner(),
    expectedClaimId: "stale",
    expectedFence: renewed.fence,
    reason: "claim-expired",
    interruptedAt: now,
  });
  expect(result.changed).toBe(false);
  expect(
    (
      await provider.loadThread({
        ...scope,
        threadId: thread.threadId,
        maxEncodedBytes: limits.maxSnapshotBytes,
      })
    ).currentRuns[0]?.status,
  ).toBe("running");
});

/**
 * Creates the exact native stale claim fixture.
 * @returns The owned provider and admitted state used by the following scenario phase.
 */
async function runningClaimedThread() {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(4),
    threadId: "stale-interruption-thread",
    semanticDigest: "t",
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operationId(5),
    semanticDigest: "r",
    threadId: thread.threadId,
    owner: owner(),
    input: null,
    inputDigest: "i",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    workerId: "w",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  return { provider, scope, now, thread, run, claim };
}
