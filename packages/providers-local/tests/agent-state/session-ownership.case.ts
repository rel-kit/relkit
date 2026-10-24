/** Preserves the native session ownership state scenario. */
import { expect, test } from "vitest";
import { setup, limits } from "./fixture.js";
import { operationId } from "./identity.js";

test("thread ownership survives a same-principal session replacement only", async () => {
  const { provider, scope } = await setup();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(50),
    threadId: "session-thread",
    semanticDigest: "session-thread",
    now: new Date().toISOString(),
    limits,
  });
  await expect(
    provider.loadThread({
      ...scope,
      sessionEpoch: "replacement-session",
      threadId: thread.threadId,
      maxEncodedBytes: limits.maxSnapshotBytes,
    }),
  ).resolves.toMatchObject({ thread: { threadId: thread.threadId } });
  await expect(
    provider.loadThread({
      ...scope,
      identityScope: "other-principal",
      ownerScope: "other-owner",
      sessionEpoch: "other-session",
      threadId: thread.threadId,
      maxEncodedBytes: limits.maxSnapshotBytes,
    }),
  ).rejects.toThrow("Thread was not found");
});
