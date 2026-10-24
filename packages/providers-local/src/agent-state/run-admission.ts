/** Validates run capacity and constructs atomic admission state. */
import type { AcceptRunRequest, AcceptRunReceipt } from "@relkit/contracts";
import type { LocalAgentState, LocalAgentThread } from "./state.js";
import { scopeKey, encodedBytes, LocalAgentStateError, operationStorageKey } from "./common.js";
import { replaceThread } from "./run-state.js";

/**
 * Checks run admission capacity before allocating an identity.
 * @param state - Snapshot supplied by the owning atomic store update.
 * @param local - Owned thread projected from the same snapshot.
 * @param request - Validated scoped request, including operation identity and capacity policy.
 * @returns Nothing; rejects a busy thread or exhausted run/journal capacity.
 */
export function assertRunCapacity(
  state: LocalAgentState,
  local: LocalAgentThread,
  request: AcceptRunRequest,
) {
  const reservedFollowUp =
    local.activeRunId === undefined &&
    Object.values(local.controls).some(
      (item) =>
        item.record.kind === "follow-up" &&
        item.record.controlId === request.operationId &&
        item.semanticDigest === request.semanticDigest &&
        (item.receipt.status === "accepted" || item.receipt.status === "processing"),
    );
  if (local.thread.status !== "idle" && !reservedFollowUp)
    throw new LocalAgentStateError("AGENT_BUSY", "Thread is not idle.");
  const active = Object.values(state.threads)
    .flatMap((item) => Object.values(item.runs))
    .filter((run) => run.status === "accepted" || run.status === "running");
  if (active.length >= request.limits.maxActiveRunsPerApplication)
    throw new LocalAgentStateError(
      "AGENT_PROVIDER_OVERLOADED",
      "Application run capacity is full.",
    );
  const principalActive = Object.values(state.threads)
    .filter((item) => item.scopeKey === scopeKey(request))
    .flatMap((item) => Object.values(item.runs))
    .filter((run) => run.status === "accepted" || run.status === "running");
  if (principalActive.length >= request.limits.maxActiveRunsPerPrincipal)
    throw new LocalAgentStateError("AGENT_PRINCIPAL_OVERLOADED", "Principal run capacity is full.");
  const journalBytes = local.journal.reduce((sum, record) => sum + record.encodedBytes, 0);
  if (journalBytes > request.limits.maxJournalBytesPerThread - request.limits.terminalReserveBytes)
    throw new LocalAgentStateError(
      "AGENT_JOURNAL_OVERLOADED",
      "Thread cannot reserve terminal journal capacity.",
    );
}

/**
 * Constructs a new run and receipt after admission checks.
 * @param state - Snapshot supplied by the owning atomic store update.
 * @param local - Owned thread projected from the same snapshot.
 * @param request - Validated scoped request, including operation identity and capacity policy.
 * @returns The next snapshot and accepted run receipt, rejecting oversized total state.
 */
export function commitRunAdmission(
  state: LocalAgentState,
  local: LocalAgentThread,
  request: AcceptRunRequest,
) {
  const runId = crypto.randomUUID();
  const run = {
    runId,
    threadId: request.threadId,
    owner: request.owner,
    operationId: request.operationId,
    status: "accepted" as const,
    inputDigest: request.inputDigest,
    acceptedAt: request.acceptedAt,
    maxJournalBytes: request.limits.maxJournalBytesPerThread,
    maxJournalRecordBytes: request.limits.maxJournalRecordBytes,
    terminalReserveBytes: request.limits.terminalReserveBytes,
  };
  const receipt: AcceptRunReceipt = {
    operationId: request.operationId,
    threadId: request.threadId,
    runId,
    status: "accepted",
    duplicate: false,
  };
  const next = {
    ...replaceThread(state, request.threadId, {
      ...local,
      activeRunId: runId,
      runs: { ...local.runs, [runId]: run },
      thread: {
        ...local.thread,
        status: "running" as const,
        updatedAt: request.acceptedAt,
        revision: String(Number(local.thread.revision) + 1),
      },
    }),
    runReceipts: {
      ...state.runReceipts,
      [operationStorageKey(request, request.operationId)]: {
        semanticDigest: request.semanticDigest,
        expiresAt: request.receiptExpiresAt,
        value: receipt,
      },
    },
  };
  if (encodedBytes(next) > request.limits.maxStateBytesPerApplication)
    throw new LocalAgentStateError("AGENT_PROVIDER_OVERLOADED", "Agent-state capacity is full.");
  return [next, receipt] as const;
}
