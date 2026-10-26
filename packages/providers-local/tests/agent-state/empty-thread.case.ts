/** Preserves the native empty thread state scenario. */
import { expect, test } from "vitest";
import { setup, limits } from "./fixture.js";
import { operationId } from "./identity.js";

test("empty caller thread IDs are rejected without normalization", async () => {
  const { provider, scope } = await setup();
  for (const threadId of ["", "   "]) {
    await expect(
      provider.createThread({
        ...scope,
        operationId: operationId(70 + threadId.length),
        threadId,
        semanticDigest: "invalid-thread",
        now: new Date().toISOString(),
        limits,
      }),
    ).rejects.toMatchObject({ code: "INVALID_THREAD_ID" });
  }
});
