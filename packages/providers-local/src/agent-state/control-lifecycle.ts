import { mutateClaimed } from "./control-mutation.js";
import { requireControl, withControl } from "./control-record.js";
import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type {
  ClaimControlRequest,
  ControlClaim,
  ControlReceipt,
  MarkControlEffectStartedRequest,
  RecoverAbandonedControlRequest,
  RenewControlClaimRequest,
  SettleControlRequest,
} from "@relkit/agents";
import { activeClaim, LocalAgentStateError, operationStorageKey, ownedThread } from "./common.js";
import { replaceThread } from "./run-state.js";
import type { AgentStateStoreEffects as AgentStateStore } from "./storage.js";

/**
 * Acquires a fenced claim for a pending control request.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const claimControl = Effect.fn("AgentState.claimControl")(
  function* (store: AgentStateStore, request: ClaimControlRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return store.update((state) => {
          const local = ownedThread(state, request, request.threadId);
          const item = requireControl(local, request.operationId);
          if (item.receipt.status !== "accepted")
            throw new LocalAgentStateError("CONTROL_NOT_PENDING", "Control is not pending.");
          const old = local.controlClaims[request.operationId];
          if (old !== undefined && Date.parse(old.expiresAt) > operationNow)
            throw new LocalAgentStateError(
              "CONTROL_ALREADY_CLAIMED",
              "Control has an active claim.",
            );
          const claim: ControlClaim = {
            claimId: crypto.randomUUID(),
            controlId: request.operationId,
            workerId: request.workerId,
            generationId: request.generationId,
            fence: local.nextFence + 1,
            expiresAt: request.expiresAt,
          };
          const receipt = { ...item.receipt, status: "processing" as const };
          const record = { ...item.record, status: "processing" as const };
          return [
            withControl(
              state,
              request,
              request.threadId,
              request.operationId,
              { ...item, receipt, record },
              claim,
            ),
            claim,
          ] as const;
        });
      }),
    );
  },
  (effect) => localOperation("AgentState.claimControl", effect),
);

/**
 * Renews a control lease only for its current fenced owner.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const renewControlClaim = Effect.fn("AgentState.renewControlClaim")(
  function* (store: AgentStateStore, request: RenewControlClaimRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return store.update((state) => {
          const local = ownedThread(state, request, request.threadId);
          activeClaim(local.controlClaims[request.claim.controlId], request.claim, operationNow);
          const claim = { ...request.claim, expiresAt: request.expiresAt };
          return [
            replaceThread(state, request.threadId, {
              ...local,
              controlClaims: { ...local.controlClaims, [claim.controlId]: claim },
            }),
            claim,
          ] as const;
        });
      }),
    );
  },
  (effect) => localOperation("AgentState.renewControlClaim", effect),
);

/**
 * Persists whether a control side effect is confirmed or still uncertain.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const markEffect = Effect.fn("AgentState.markEffect")(
  function* (store: AgentStateStore, request: MarkControlEffectStartedRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return mutateClaimed(
          store,
          request,
          (receipt) => ({ ...receipt, effect: "unknown" }),
          undefined,
          request.downstreamOperationId,
        );
      }),
    );
  },
  (effect) => localOperation("AgentState.markEffect", effect),
);

/**
 * Commits a control outcome and its idempotent receipt together.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const settleControl = Effect.fn("AgentState.settleControl")(
  function* (store: AgentStateStore, request: SettleControlRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return mutateClaimed(
          store,
          request,
          (receipt) => ({ ...receipt, status: request.status, effect: request.effect }),
          request.settledAt,
        );
      }),
    );
  },
  (effect) => localOperation("AgentState.settleControl", effect),
);

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
