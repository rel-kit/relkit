/** Preserves the native operation pruning state scenario. */
import { expect, test } from "vitest";
import { createOperationId } from "@relkit/realtime";
import { setup } from "./fixture.js";

test("a pruned operation remains distinguishable from a current-epoch miss", async () => {
  const { provider, scope } = await setup();
  const now = new Date().toISOString();
  expect(
    await provider.lookupRunReceipt({
      ...scope,
      operationId: createOperationId(Date.now() - 31 * 86_400_000),
      semanticDigest: "old",
      now,
    }),
  ).toMatchObject({ status: "expired" });
  expect(
    await provider.lookupRunReceipt({
      ...scope,
      operationId: createOperationId(),
      semanticDigest: "new",
      now,
    }),
  ).toMatchObject({ status: "not-found", providerEpoch: scope.providerEpoch });
});
