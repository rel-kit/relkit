/** Preserves the native exact thread state scenario. */
import { expect, test } from "vitest";
import { setup, limits } from "./fixture.js";
import { owner, operationId, future } from "./identity.js";

test("caller thread IDs are exact, ensured, and isolated by agent ownership", async () => {
  const { provider, scope, now, threadId, otherScope } = await ensuredThreadOwners();
  const runOperationId = operationId(62);
  const run = await provider.acceptRun({
    ...scope,
    operationId: runOperationId,
    semanticDigest: "isolated-run",
    threadId,
    owner: owner(),
    input: null,
    inputDigest: "null",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  expect(run.threadId).toBe(threadId);
  expect(
    (await provider.loadThread({ ...scope, threadId, maxEncodedBytes: limits.maxSnapshotBytes }))
      .thread.status,
  ).toBe("running");
  expect(
    (
      await provider.loadThread({
        ...otherScope,
        threadId,
        maxEncodedBytes: limits.maxSnapshotBytes,
      })
    ).thread.status,
  ).toBe("idle");
  const otherRun = await provider.acceptRun({
    ...otherScope,
    operationId: runOperationId,
    semanticDigest: "other-isolated-run",
    threadId,
    owner: owner(),
    input: null,
    inputDigest: "null",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  expect(otherRun.threadId).toBe(threadId);
});

/**
 * Creates the exact native exact thread fixture.
 * @returns The owned provider and admitted state used by the following scenario phase.
 */
async function ensuredThreadOwners() {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  const sharedOperationId = operationId(60);
  const threadId = "order:123 / review";
  const first = await provider.createThread({
    ...scope,
    operationId: sharedOperationId,
    threadId,
    semanticDigest: "first-thread",
    now,
    limits,
  });
  const ensured = await provider.createThread({
    ...scope,
    operationId: operationId(61),
    threadId,
    semanticDigest: "ensure-thread",
    now: future(1),
    limits,
  });
  const otherScope = { ...scope, agentId: "reviewer", ownerScope: "other-owner" };
  const other = await provider.createThread({
    ...otherScope,
    operationId: sharedOperationId,
    threadId,
    semanticDigest: "other-thread",
    now,
    limits,
  });
  expect(first).toEqual(ensured);
  expect(other.threadId).toBe(threadId);
  expect((await provider.listThreads({ ...scope, limit: 10 })).threads).toHaveLength(1);
  expect((await provider.listThreads({ ...otherScope, limit: 10 })).threads).toHaveLength(1);
  return { provider, scope, now, threadId, otherScope };
}
