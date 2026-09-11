import type { AgentRequestScope } from "@relkit/agents";
import { ownedThread } from "./common.js";
import { recoverControl } from "./control-lifecycle.js";
import type { AgentStateStore } from "./storage.js";

type RecoveryRequest = AgentRequestScope & { readonly threadId: string };

/** Provider-owned recovery for controls whose worker lease expired. */
export async function recoverExpiredControls(
  store: AgentStateStore,
  request: RecoveryRequest,
  now = Date.now(),
): Promise<void> {
  const state = await store.read();
  const local = ownedThread(state, request, request.threadId);
  const expired = Object.entries(local.controlClaims).filter(
    ([operationId, claim]) =>
      local.controls[operationId]?.receipt.status === "processing" &&
      Date.parse(claim.expiresAt) <= now,
  );
  for (const [operationId, claim] of expired) {
    await recoverControl(store, {
      ...request,
      operationId: operationId as typeof claim.controlId,
      runId: local.controls[operationId]!.receipt.runId,
      expectedClaimId: claim.claimId,
      expectedFence: claim.fence,
      recoveredAt: new Date(now).toISOString(),
    });
  }
}
