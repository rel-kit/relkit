/** Recovers expired control claims from persisted downstream receipts without repeating confirmed effects. */

import { requireControl, withControl } from "./control-record.js";
import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type { ControlReceipt, RecoverAbandonedControlRequest } from "@relkit/contracts";
import { operationStorageKey, ownedThread } from "./common.js";

import type { AgentStateStoreEffects as AgentStateStore } from "./storage.js";

/**
 * Recovers expired control ownership without inventing confirmed side effects.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const recoverControl = Effect.fn("AgentState.recoverControl")(
  function* (store: AgentStateStore, request: RecoverAbandonedControlRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return store.update<ControlReceipt>((state) => {
          const local = ownedThread(state, request, request.threadId);
          const item = requireControl(local, request.operationId);
          const claim = local.controlClaims[request.operationId];
          if (
            claim?.claimId !== request.expectedClaimId ||
            claim.fence !== request.expectedFence ||
            Date.parse(claim.expiresAt) > operationNow
          )
            return [state, item.receipt] as const;
          const downstream =
            item.downstreamOperationId === undefined
              ? undefined
              : (state.continuationReceipts[
                  operationStorageKey(request, item.downstreamOperationId)
                ]?.value ??
                state.runReceipts[operationStorageKey(request, item.downstreamOperationId)]?.value);
          const receipt: ControlReceipt =
            downstream !== undefined
              ? { ...item.receipt, status: "applied", effect: "confirmed" }
              : item.receipt.effect === "not-started"
                ? { ...item.receipt, status: "accepted" }
                : { ...item.receipt, status: "rejected", effect: "unknown" };
          return [
            withControl(state, request, request.threadId, request.operationId, {
              ...item,
              receipt,
              record: {
                ...item.record,
                status: receipt.status,
                effect: receipt.effect,
                ...(receipt.status === "accepted" ? {} : { settledAt: request.recoveredAt }),
              },
            }),
            receipt,
          ] as const;
        });
      }),
    );
  },
  (effect) => localOperation("AgentState.recoverControl", effect),
);
