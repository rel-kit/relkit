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
import { replaceThread, settleIdleThread } from "./run-state.js";
import type { AgentStateStore } from "./storage.js";

export function claimControl(
  store: AgentStateStore,
  request: ClaimControlRequest,
): Promise<ControlClaim> {
  return store.update((state) => {
    const local = ownedThread(state, request, request.threadId);
    const item = requireControl(local, request.operationId);
    if (item.receipt.status !== "accepted")
      throw new LocalAgentStateError("CONTROL_NOT_PENDING", "Control is not pending.");
    const old = local.controlClaims[request.operationId];
    if (old !== undefined && Date.parse(old.expiresAt) > Date.now())
      throw new LocalAgentStateError("CONTROL_ALREADY_CLAIMED", "Control has an active claim.");
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
}

export function renewControlClaim(
  store: AgentStateStore,
  request: RenewControlClaimRequest,
): Promise<ControlClaim> {
  return store.update((state) => {
    const local = ownedThread(state, request, request.threadId);
    activeClaim(local.controlClaims[request.claim.controlId], request.claim);
    const claim = { ...request.claim, expiresAt: request.expiresAt };
    return [
      replaceThread(state, request.threadId, {
        ...local,
        controlClaims: { ...local.controlClaims, [claim.controlId]: claim },
      }),
      claim,
    ] as const;
  });
}

export function markEffect(store: AgentStateStore, request: MarkControlEffectStartedRequest) {
  return mutateClaimed(
    store,
    request,
    (receipt) => ({ ...receipt, effect: "unknown" }),
    undefined,
    request.downstreamOperationId,
  );
}

export function settleControl(store: AgentStateStore, request: SettleControlRequest) {
  return mutateClaimed(
    store,
    request,
    (receipt) => ({ ...receipt, status: request.status, effect: request.effect }),
    request.settledAt,
  );
}

export function recoverControl(store: AgentStateStore, request: RecoverAbandonedControlRequest) {
  return store.update<ControlReceipt>((state) => {
    const local = ownedThread(state, request, request.threadId);
    const item = requireControl(local, request.operationId);
    const claim = local.controlClaims[request.operationId];
    if (
      claim?.claimId !== request.expectedClaimId ||
      claim.fence !== request.expectedFence ||
      Date.parse(claim.expiresAt) > Date.now()
    )
      return [state, item.receipt] as const;
    const downstream =
      item.downstreamOperationId === undefined
        ? undefined
        : (state.continuationReceipts[operationStorageKey(request, item.downstreamOperationId)]
            ?.value ??
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
}

function mutateClaimed(
  store: AgentStateStore,
  request: MarkControlEffectStartedRequest | SettleControlRequest,
  change: (receipt: ControlReceipt) => ControlReceipt,
  settledAt?: string,
  downstreamOperationId?: string,
) {
  return store.update<ControlReceipt>((state) => {
    const local = ownedThread(state, request, request.threadId);
    activeClaim(local.controlClaims[request.operationId], request.claim);
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
}

function requireControl(local: ReturnType<typeof ownedThread>, operationId: string) {
  const item = local.controls[operationId];
  if (item === undefined) throw new LocalAgentStateError("NOT_FOUND", "Control was not found.");
  return item;
}

function withControl(
  state: Parameters<typeof replaceThread>[0],
  scope: Parameters<typeof ownedThread>[1],
  threadId: string,
  operationId: string,
  item: ReturnType<typeof requireControl>,
  claim?: ControlClaim,
) {
  const local = ownedThread(state, scope, threadId);
  return replaceThread(state, threadId, {
    ...local,
    nextFence: claim?.fence ?? local.nextFence,
    controls: { ...local.controls, [operationId]: item },
    controlClaims:
      claim === undefined ? local.controlClaims : { ...local.controlClaims, [operationId]: claim },
  });
}
