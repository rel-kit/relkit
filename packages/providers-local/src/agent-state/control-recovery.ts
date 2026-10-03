import type { RecoveryRequest } from "./control-recovery.types.js";
import { Clock, Effect } from "effect";
import { localOperation } from "../local-effect.js";
import { ownedThread } from "./common.js";
import { recoverControl } from "./control-lifecycle.js";
import type { AgentStateStoreEffects as AgentStateStore } from "./storage.js";

/** Provider-owned recovery for controls whose worker lease expired.
 * @param store - Owning transaction or durable journal operations.
 * @param request - Validated scoped domain request.
 * @param now - Clock time in milliseconds.
 * @returns A lazy effect completing after expired control claims are settled or made retryable.
 */
export const recoverExpiredControls = Effect.fn("AgentState.recoverExpiredControls")(
  function* (store: AgentStateStore, request: RecoveryRequest, now?: number) {
    const operationNow = yield* Clock.currentTimeMillis;
    now ??= operationNow;

    const state = yield* store.read();
    const local = ownedThread(state, request, request.threadId);
    const expired = Object.entries(local.controlClaims).filter(
      ([operationId, claim]) =>
        local.controls[operationId]?.receipt.status === "processing" &&
        Date.parse(claim.expiresAt) <= now,
    );
    for (const [operationId, claim] of expired) {
      yield* recoverControl(store, {
        ...request,
        operationId: operationId as typeof claim.controlId,
        runId: local.controls[operationId]!.receipt.runId,
        expectedClaimId: claim.claimId,
        expectedFence: claim.fence,
        recoveredAt: new Date(now).toISOString(),
      });
    }
  },
  (effect) => localOperation("AgentState.recoverExpiredControls", effect),
);
