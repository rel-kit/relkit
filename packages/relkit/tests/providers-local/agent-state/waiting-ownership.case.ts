/** Preserves the native waiting ownership state scenario. */
import { expect, test } from "vitest";
import { setup, createWaitingRun, limits } from "./fixture.js";
import { operationId, future, digest } from "./identity.js";

test("continuation admission is isolated by exact thread and owner scope", async () => {
  const { provider, scope, first, otherScope, attempt } = await isolatedWaitingOwners();
  await expect(
    provider.admitContinuation({
      ...scope,
      ...attempt,
      operationId: operationId(123),
      threadId: "other-thread",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    provider.admitContinuation({
      ...otherScope,
      ...attempt,
      operationId: operationId(124),
      threadId: "isolated-resume",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const snapshot = await provider.loadThread({
    ...scope,
    threadId: "isolated-resume",
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot.thread.status).toBe("waiting");
  expect(snapshot.waiting?.runId).toBe(first.runId);
  const operation = operationId(125);
  await provider.admitContinuation({
    ...scope,
    ...attempt,
    operationId: operation,
    threadId: "isolated-resume",
  });
  await expect(
    provider.admitContinuation({
      ...scope,
      ...attempt,
      operationId: operation,
      threadId: "other-thread",
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});

/**
 * Creates the exact native waiting ownership fixture.
 * @returns The owned provider and admitted state used by the following scenario phase.
 */
async function isolatedWaitingOwners() {
  const { provider, scope } = await setup();
  const first = await createWaitingRun(provider, scope, "isolated-resume", 100);
  await createWaitingRun(provider, scope, "other-thread", 110);
  const otherScope = { ...scope, ownerScope: "other-owner", authorizationGrantId: "other-grant" };
  await createWaitingRun(provider, otherScope, "isolated-resume", 120);
  const attempt = {
    kind: "resume" as const,
    semanticDigest: "foreign-resume",
    interruptedRunId: first.runId,
    interruptSetDigest: digest(first.waiting),
    waitingRevision: first.waiting.revision,
    admittedAt: new Date().toISOString(),
    receiptExpiresAt: future(30),
  };
  return { provider, scope, first, otherScope, attempt };
}
