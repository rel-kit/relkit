/** Preserves the native waiting competition state scenario. */
import { expect, test } from "vitest";
import { setup, createWaitingRun, limits } from "./fixture.js";
import { operationId, future, digest } from "./identity.js";

test("competing continuation operations admit exactly one resumed segment", async () => {
  const { provider, scope } = await setup();
  const suspended = await createWaitingRun(provider, scope, "competing-resume", 90);
  const request = {
    ...scope,
    kind: "resume" as const,
    semanticDigest: "competing-resume",
    threadId: "competing-resume",
    interruptedRunId: suspended.runId,
    interruptSetDigest: digest(suspended.waiting),
    waitingRevision: suspended.waiting.revision,
    admittedAt: new Date().toISOString(),
    receiptExpiresAt: future(30),
  };
  const results = await Promise.allSettled([
    provider.admitContinuation({ ...request, operationId: operationId(93) }),
    provider.admitContinuation({ ...request, operationId: operationId(94) }),
  ]);

  expect(results.map(({ status }) => status).sort()).toEqual(["fulfilled", "rejected"]);
  const accepted = results.find((result) => result.status === "fulfilled");
  const rejected = results.find((result) => result.status === "rejected");
  if (accepted?.status !== "fulfilled" || rejected?.status !== "rejected") {
    throw new Error("Expected one accepted and one rejected continuation.");
  }
  expect(accepted.value.duplicate).toBe(false);
  expect(rejected.reason).toMatchObject({ code: "STALE_CONTINUATION" });
  const snapshot = await provider.loadThread({
    ...scope,
    threadId: "competing-resume",
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot.currentRuns.filter(({ status }) => status === "accepted")).toHaveLength(1);
  expect(snapshot.activeRun?.runId).toBe(accepted.value.runId);
  expect(snapshot.waiting).toBeUndefined();
});
