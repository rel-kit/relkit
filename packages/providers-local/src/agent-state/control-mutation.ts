import { requireControl, withControl } from "./control-record.js";
import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type {
  ControlReceipt,
  MarkControlEffectStartedRequest,
  SettleControlRequest,
} from "@relkit/agents";
import { activeClaim, operationStorageKey, ownedThread } from "./common.js";
import { settleIdleThread } from "./run-state.js";
import type { AgentStateStoreEffects as AgentStateStore } from "./storage.js";

/**
 * Checks control ownership and commits the requested claimed-control transition atomically.
 * @param store - Owning transaction or durable journal operations.
 * @param request - Validated scoped domain request.
 * @param change - Pure transition applied inside the state transaction.
 * @param settledAt - Terminal settlement instant.
 * @param downstreamOperationId - Identity of a downstream operation owned by this control.
 * @returns The lazy control operation yielding the updated public receipt.
 */
export const mutateClaimed = Effect.fn("AgentState.mutateClaimed")(
  function* (
    store: AgentStateStore,
    request: MarkControlEffectStartedRequest | SettleControlRequest,
    change: (receipt: ControlReceipt) => ControlReceipt,
    settledAt?: string,
    downstreamOperationId?: string,
  ) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return store.update<ControlReceipt>((state) => {
          const local = ownedThread(state, request, request.threadId);
          activeClaim(local.controlClaims[request.operationId], request.claim, operationNow);
          const item = requireControl(local, request.operationId);
          const receipt = change(item.receipt);
          const record = {
            ...item.record,
            status: receipt.status,
            effect: receipt.effect,
            ...(settledAt === undefined ? {} : { settledAt }),
          };
          let next = withControl(state, request, request.threadId, request.operationId, {
            ...item,
            receipt,
            record,
            ...(downstreamOperationId === undefined ? {} : { downstreamOperationId }),
          });
          if (settledAt !== undefined) next = settleIdleThread(next, request, request.threadId);
          return [
            {
              ...next,
              controlReceipts: {
                ...next.controlReceipts,
                [operationStorageKey(request, request.operationId)]: {
                  semanticDigest: item.semanticDigest,
                  expiresAt: item.expiresAt,
                  value: receipt,
                },
              },
            },
            receipt,
          ] as const;
        });
      }),
    );
  },
  (effect) => localOperation("AgentState.mutateClaimed", effect),
);
