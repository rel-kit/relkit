/** Validates waiting and approval contracts before atomic continuation admission. */
import type { AdmitContinuationRequest, ContinuationReceipt } from "@relkit/contracts";
import { canonicalJson } from "@relkit/contracts";
import { createHash } from "node:crypto";
import type { LocalAgentState, LocalAgentThread, LocalStoredRun } from "./state.js";
import { LocalAgentStateError, operationStorageKey, ownedThread } from "./common.js";
import { replaceThread } from "./run-state.js";
/**
 * Computes the stable approval identity used to deduplicate continuation admission.
 * @param value - Untrusted or projected value to inspect.
 * @returns The canonical waiting-approval digest.
 */
function waitingDigest(value: NonNullable<ReturnType<typeof ownedThread>["waiting"]>): string {
  return `sha256:${createHash("sha256")
    .update(canonicalJson(value as never))
    .digest("hex")}`;
}

/**
 * Checks the waiting contract and prepares continuation projections.
 * @param local - Owned thread projected from the same snapshot.
 * @param interrupted - Persisted run matched to the continuation request.
 * @param request - Validated scoped request, including operation identity and capacity policy.
 * @returns The thread and approval projections after matching the current waiting contract.
 */
export function prepareContinuation(
  local: LocalAgentThread,
  interrupted: LocalStoredRun,
  request: AdmitContinuationRequest,
) {
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
    assertApprovalDecisions(local, interrupted, request);
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
  return { ready, approvals };
}

/**
 * Rejects incomplete or mismatched approval continuation decisions.
 * @param local - Owned thread projected from the same snapshot.
 * @param interrupted - Persisted run matched to the continuation request.
 * @param request - Validated scoped request, including operation identity and capacity policy.
 * @returns Nothing; rejects a non-interrupted run or an incomplete decision set.
 */
export function assertApprovalDecisions(
  local: LocalAgentThread,
  interrupted: LocalStoredRun,
  request: Extract<AdmitContinuationRequest, { kind: "approval" }>,
) {
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
}

/**
 * Publishes the validated continuation and its receipt atomically.
 * @param state - Snapshot supplied by the owning atomic store update.
 * @param local - Owned thread projected from the same snapshot.
 * @param interrupted - Persisted run matched to the continuation request.
 * @param request - Validated scoped request, including operation identity and capacity policy.
 * @param ready - Thread projection with a resumed waiting contract removed when applicable.
 * @param approvals - Approval projection containing the requested decisions.
 * @returns The next snapshot and continuation receipt, published by the original atomic update.
 */
export function commitContinuation(
  state: LocalAgentState,
  local: LocalAgentThread,
  interrupted: LocalStoredRun,
  request: AdmitContinuationRequest,
  ready: LocalAgentThread,
  approvals: LocalAgentThread["approvals"],
) {
  const { runId, run, receipt } = continuedRun(interrupted, request);
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
}

/**
 * Creates a fresh continuation identity without retaining terminal state.
 * @param interrupted - Persisted run matched to the continuation request.
 * @param request - Validated scoped request, including operation identity and capacity policy.
 * @returns A fresh run identity and receipt with terminal fields removed from the copied run.
 */
export function continuedRun(interrupted: LocalStoredRun, request: AdmitContinuationRequest) {
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
  return { runId, run, receipt };
}
