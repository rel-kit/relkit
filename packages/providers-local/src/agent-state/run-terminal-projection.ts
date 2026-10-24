/** Constructs completion state after receipt, claim and capacity validation. */
import type { CompleteRunRequest, CompletionReceipt } from "@relkit/contracts";
import type { LocalAgentState, LocalAgentThread, LocalStoredRun } from "./state.js";
import { checkpoint, operationStorageKey } from "./common.js";
import { replaceThread } from "./run-state.js";

/**
 * Publishes terminal state and its completion receipt atomically.
 * @param state - Snapshot supplied by the owning atomic store update.
 * @param local - Owned thread projected from the same snapshot.
 * @param run - Existing persisted run whose execution ownership was checked by the caller.
 * @param request - Validated scoped request, including operation identity and capacity policy.
 * @returns The next snapshot and completion receipt sharing the terminal checkpoint.
 */
export function commitCompletion(
  state: LocalAgentState,
  local: LocalAgentThread,
  run: LocalStoredRun,
  request: CompleteRunRequest,
) {
  const sequence = local.sequence + 1;
  const terminal = {
    ...request.terminalRecord,
    checkpoint: checkpoint(state, request, request.threadId, sequence),
  };
  const receipt: CompletionReceipt = {
    operationId: request.operationId,
    threadId: request.threadId,
    runId: request.runId,
    status: request.outcome,
    checkpoint: terminal.checkpoint,
    duplicate: false,
  };
  const nextThread = completedThread(local, run, request, terminal, sequence);
  return [
    {
      ...replaceThread(state, request.threadId, nextThread),
      runReceipts: {
        ...state.runReceipts,
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
 * Projects terminal thread state while retaining queued follow-up reservations.
 * @param local - Owned thread projected from the same snapshot.
 * @param run - Existing persisted run whose execution ownership was checked by the caller.
 * @param request - Validated scoped request, including operation identity and capacity policy.
 * @param terminal - Terminal journal record with its assigned checkpoint.
 * @param sequence - Next thread-local journal sequence.
 * @returns The settled thread, retaining a running reservation for any queued follow-up.
 */
export function completedThread(
  local: LocalAgentThread,
  run: LocalStoredRun,
  request: CompleteRunRequest,
  terminal: LocalAgentThread["journal"][number],
  sequence: number,
) {
  const { [request.runId]: _claim, ...claims } = local.runClaims;
  const { activeRunId: _activeRunId, ...settledLocal } = local;
  const hasQueuedFollowUp = Object.values(local.controls).some(
    (item) =>
      item.receipt.runId === request.runId &&
      item.record.kind === "follow-up" &&
      (item.receipt.status === "accepted" || item.receipt.status === "processing"),
  );
  const nextThread = {
    ...settledLocal,
    sequence,
    journal: [...local.journal, terminal],
    runClaims: claims,
    runs: {
      ...local.runs,
      [request.runId]: {
        ...run,
        status: request.outcome,
        outcome: request.outcome,
        settledAt: request.settledAt,
      },
    },
    thread: {
      ...local.thread,
      status: hasQueuedFollowUp ? ("running" as const) : ("idle" as const),
      updatedAt: request.settledAt,
      revision: String(Number(local.thread.revision) + 1),
    },
  };
  return nextThread;
}
