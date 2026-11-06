/** Preserves the native waiting digest state scenario. */
import { expect, test } from "vitest";
import { setup, createWaitingRun, limits } from "./fixture.js";
import { operationId, future, digest } from "./identity.js";

test("continuation rejects a digest for any other waiting contract", async () => {
  const { provider, scope } = await setup();
  const suspended = await createWaitingRun(provider, scope, "contract-bound-resume", 86);

  await expect(
    provider.admitContinuation({
      ...scope,
      kind: "resume",
      operationId: operationId(89),
      semanticDigest: "wrong-waiting-contract",
      threadId: "contract-bound-resume",
      interruptedRunId: suspended.runId,
      interruptSetDigest: digest({ ...suspended.waiting, response: { type: "string" } }),
      waitingRevision: suspended.waiting.revision,
      admittedAt: new Date().toISOString(),
      receiptExpiresAt: future(30),
    }),
  ).rejects.toMatchObject({ code: "STALE_CONTINUATION" });
  const snapshot = await provider.loadThread({
    ...scope,
    threadId: "contract-bound-resume",
    maxEncodedBytes: limits.maxSnapshotBytes,
  });
  expect(snapshot.thread.status).toBe("waiting");
  expect(snapshot.waiting).toEqual(suspended.waiting);
});
