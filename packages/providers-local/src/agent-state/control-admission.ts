/** Validates control capacity and constructs atomic control admission. */
import type { AcceptControlRequest, ControlReceipt } from "@relkit/contracts";
import { decideThreadTransition } from "@relkit/contracts";
import type { LocalAgentState, LocalAgentThread } from "./state.js";
import { LocalAgentStateError, operationStorageKey } from "./common.js";
import { replaceThread } from "./run-state.js";

/**
 * Validates active-run transition and bounded control queues.
 * @param state - Snapshot supplied by the owning atomic store update.
 * @param local - Owned thread projected from the same snapshot.
 * @param request - Validated scoped request, including operation identity and capacity policy.
 * @returns Nothing; rejects invalid transitions or full queues with LocalAgentStateError.
 */
export function assertControlCapacity(
  state: LocalAgentState,
  local: LocalAgentThread,
  request: AcceptControlRequest,
) {
  if (local.activeRunId !== request.runId)
    throw new LocalAgentStateError("NOT_FOUND", "Active run was not found.");
  const action = request.kind === "approve" ? "approve" : request.kind;
  const transition = decideThreadTransition(local.thread.status, action);
  if (!transition.accepted)
    throw new LocalAgentStateError(transition.code, "Control is invalid for the thread state.");
  const pending = Object.values(local.controls).filter(
    (item) => item.receipt.status === "accepted" || item.receipt.status === "processing",
  );
  if (
    pending.filter((item) => item.receipt.runId === request.runId).length >=
    request.limits.maxQueuedPerRun
  )
    throw new LocalAgentStateError("AGENT_CONTROL_OVERLOADED", "Run control queue is full.");
  const applicationPending = Object.values(state.threads)
    .flatMap((thread) => Object.values(thread.controls))
    .filter((item) => item.receipt.status === "accepted" || item.receipt.status === "processing");
  if (applicationPending.length >= request.limits.maxQueuedPerApplication)
    throw new LocalAgentStateError(
      "AGENT_PROVIDER_OVERLOADED",
      "Application control capacity is full.",
    );
}

/**
 * Commits a validated control and its idempotency receipt together.
 * @param state - Snapshot supplied by the owning atomic store update.
 * @param local - Owned thread projected from the same snapshot.
 * @param request - Validated scoped request, including operation identity and capacity policy.
 * @returns The next snapshot and accepted control receipt for one atomic publication.
 */
export function commitControl(
  state: LocalAgentState,
  local: LocalAgentThread,
  request: AcceptControlRequest,
) {
  const { receipt, sequence, item } = controlItem(local, request);
  const next = {
    ...local,
    controlSequence: sequence,
    controls: { ...local.controls, [request.operationId]: item },
    thread:
      request.kind === "stop"
        ? { ...local.thread, status: "stopping" as const, updatedAt: request.acceptedAt }
        : local.thread,
  };
  return [
    {
      ...replaceThread(state, request.threadId, next),
      controlReceipts: {
        ...state.controlReceipts,
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
 * Creates the control record and receipt with their shared sequence.
 * @param local - Owned thread projected from the same snapshot.
 * @param request - Validated scoped request, including operation identity and capacity policy.
 * @returns The shared control sequence, journal payload and accepted receipt.
 */
export function controlItem(local: LocalAgentThread, request: AcceptControlRequest) {
  const receipt: ControlReceipt = {
    operationId: request.operationId,
    threadId: request.threadId,
    runId: request.runId,
    status: "accepted",
    effect: "not-started",
    duplicate: false,
  };
  const sequence = local.controlSequence + 1;
  const record = {
    controlId: request.operationId,
    runId: request.runId,
    kind: request.kind,
    semanticDigest: request.semanticDigest,
    publicPayload: request.publicPayload,
    status: "accepted" as const,
    effect: "not-started" as const,
    acceptedAt: request.acceptedAt,
  };
  const item = {
    sequence,
    record,
    receipt,
    semanticDigest: request.semanticDigest,
    expiresAt: request.receiptExpiresAt,
    publicPayload: request.publicPayload,
  };
  return { receipt, sequence, item };
}
