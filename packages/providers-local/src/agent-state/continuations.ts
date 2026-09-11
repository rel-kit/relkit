import type {
  AdmitContinuationRequest,
  ContinuationReceipt,
  LookupContinuationReceiptRequest,
} from "@relkit/agents";
import { canonicalJson } from "@relkit/contracts";
import { createHash } from "node:crypto";
import {
  assertOperationReceiptFresh,
  expiredOperationReceipt,
  LocalAgentStateError,
  lookupReceipt,
  operationStorageKey,
  ownedThread,
} from "./common.js";
import { replaceThread } from "./run-state.js";
import type { AgentStateStore } from "./storage.js";

export function admitContinuation(
  store: AgentStateStore,
  request: AdmitContinuationRequest,
): Promise<ContinuationReceipt> {
  return store.update((state) => {
    const local = ownedThread(state, request, request.threadId);
    const prior = lookupReceipt(
      state.continuationReceipts[operationStorageKey(request, request.operationId)],
      request.semanticDigest,
      request.admittedAt,
    );
    if (prior !== undefined && prior !== "expired") {
      if (
        prior.threadId !== request.threadId ||
        prior.interruptedRunId !== request.interruptedRunId ||
        prior.interruptSetDigest !== request.interruptSetDigest ||
        (request.kind === "resume"
          ? prior.waitingRevision !== request.waitingRevision
          : prior.waitingRevision !== undefined)
      ) {
        throw new LocalAgentStateError(
          "IDEMPOTENCY_CONFLICT",
          "Continuation receipt belongs to another waiting contract.",
        );
      }
      return [state, { ...prior, duplicate: true }] as const;
    }
    if (prior === "expired") {
      throw new LocalAgentStateError("IDEMPOTENCY_WINDOW_EXPIRED", "Continuation receipt expired.");
    }
    assertOperationReceiptFresh(request.operationId, request.admittedAt);
    const interrupted = local.runs[request.interruptedRunId];
    if (interrupted === undefined) {
      throw new LocalAgentStateError("NOT_FOUND", "Interrupted run was not found.");
    }
    let approvals = local.approvals;
    let ready = local;
    if (request.kind === "resume") {
      if (
        local.thread.status !== "waiting" ||
        interrupted.status !== "waiting" ||
        local.waiting?.runId !== request.interruptedRunId ||
        local.waiting.revision !== request.waitingRevision ||
        waitingDigest(local.waiting) !== request.interruptSetDigest
      )
        throw new LocalAgentStateError("STALE_CONTINUATION", "Waiting revision is not current.");
      const { waiting: _waiting, ...withoutWaiting } = local;
      ready = withoutWaiting;
    } else {
      if (
        local.thread.status !== "approval-interrupted" ||
        interrupted.status !== "approval-interrupted"
      )
        throw new LocalAgentStateError("AGENT_APPROVAL_REQUIRED", "Thread is not interrupted.");
      const open = local.approvals.filter(
        (approval) =>
          approval.runId === request.interruptedRunId &&
          approval.interruptSetDigest === request.interruptSetDigest &&
          approval.status === "open",
      );
      if (
        open.length === 0 ||
        open.some((approval) => request.decisions[approval.approvalId] === undefined)
      )
        throw new LocalAgentStateError(
          "APPROVALS_INCOMPLETE",
          "Every open interrupt needs a decision.",
        );
      approvals = local.approvals.map((approval) => {
        const decision = request.decisions[approval.approvalId];
        return decision === undefined
          ? approval
          : {
              ...approval,
              status: decision === "approve" ? ("approved" as const) : ("denied" as const),
            };
      });
    }
    const runId = crypto.randomUUID();
    const run = {
      ...interrupted,
      runId,
      operationId: request.operationId,
      status: "accepted" as const,
      acceptedAt: request.admittedAt,
    };
    delete (run as Partial<typeof run>).settledAt;
    delete (run as Partial<typeof run>).outcome;
    const receipt: ContinuationReceipt = {
      operationId: request.operationId,
      threadId: request.threadId,
      interruptedRunId: request.interruptedRunId,
      runId,
      interruptSetDigest: request.interruptSetDigest,
      ...(request.kind === "resume" ? { waitingRevision: request.waitingRevision } : {}),
      duplicate: false,
    };
    const { [request.interruptedRunId]: _interruptedClaim, ...runClaims } = local.runClaims;
    const next = replaceThread(state, request.threadId, {
      ...ready,
      activeRunId: runId,
      runs: { ...local.runs, [runId]: run },
      runClaims,
      approvals,
      thread: {
        ...local.thread,
        status: "running",
        updatedAt: request.admittedAt,
        revision: String(Number(local.thread.revision) + 1),
      },
    });
    return [
      {
        ...next,
        continuationReceipts: {
          ...state.continuationReceipts,
          [operationStorageKey(request, request.operationId)]: {
            semanticDigest: request.semanticDigest,
            expiresAt: request.receiptExpiresAt,
            value: receipt,
          },
        },
      },
      receipt,
    ] as const;
  });
}

function waitingDigest(value: NonNullable<ReturnType<typeof ownedThread>["waiting"]>): string {
  return `sha256:${createHash("sha256")
    .update(canonicalJson(value as never))
    .digest("hex")}`;
}

export async function lookupContinuation(
  store: AgentStateStore,
  request: LookupContinuationReceiptRequest,
) {
  const state = await store.read();
  if (request.providerEpoch !== state.providerEpoch) {
    return { status: "state-lost" as const, previousEpoch: request.providerEpoch };
  }
  ownedThread(state, request, request.threadId);
  const value = lookupReceipt(
    state.continuationReceipts[operationStorageKey(request, request.operationId)],
    request.semanticDigest,
    request.now,
  );
  if (value === undefined)
    return (
      expiredOperationReceipt(request.operationId, request.now) ?? {
        status: "not-found" as const,
        providerEpoch: state.providerEpoch,
      }
    );
  if (value === "expired")
    return {
      status: "expired" as const,
      expiredAt:
        state.continuationReceipts[operationStorageKey(request, request.operationId)]?.expiresAt ??
        request.now,
    };
  if (
    (request.interruptedRunId !== undefined &&
      value.interruptedRunId !== request.interruptedRunId) ||
    (request.interruptSetDigest !== undefined &&
      value.interruptSetDigest !== request.interruptSetDigest)
  ) {
    throw new LocalAgentStateError("IDEMPOTENCY_CONFLICT", "Continuation identity conflicts.");
  }
  return { status: "found" as const, receipt: value };
}
