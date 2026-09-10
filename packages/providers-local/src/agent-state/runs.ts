import type {
  AcceptRunReceipt,
  AcceptRunRequest,
  LookupRunReceiptRequest,
  RunReceiptLookup,
} from "@relkit/agents";
import {
  assertOperationReceiptFresh,
  encodedBytes,
  expiredOperationReceipt,
  LocalAgentStateError,
  lookupReceipt,
  operationStorageKey,
  ownedThread,
  scopeKey,
} from "./common.js";
import { replaceThread } from "./run-state.js";
import type { AgentStateStore } from "./storage.js";

export function acceptRun(store: AgentStateStore, request: AcceptRunRequest) {
  return store.update<AcceptRunReceipt>((state) => {
    const local = ownedThread(state, request, request.threadId);
    const prior = lookupReceipt(
      state.runReceipts[operationStorageKey(request, request.operationId)],
      request.semanticDigest,
      request.acceptedAt,
    );
    if (prior !== undefined && prior !== "expired")
      return [state, { ...prior, duplicate: true } as AcceptRunReceipt] as const;
    if (prior === "expired")
      throw new LocalAgentStateError("IDEMPOTENCY_WINDOW_EXPIRED", "Run receipt expired.");
    assertOperationReceiptFresh(request.operationId, request.acceptedAt);
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
      throw new LocalAgentStateError(
        "AGENT_PRINCIPAL_OVERLOADED",
        "Principal run capacity is full.",
      );
    const journalBytes = local.journal.reduce((sum, record) => sum + record.encodedBytes, 0);
    if (
      journalBytes >
      request.limits.maxJournalBytesPerThread - request.limits.terminalReserveBytes
    )
      throw new LocalAgentStateError(
        "AGENT_JOURNAL_OVERLOADED",
        "Thread cannot reserve terminal journal capacity.",
      );
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
  });
}

export async function lookupRunReceipt(
  store: AgentStateStore,
  request: LookupRunReceiptRequest,
): Promise<RunReceiptLookup> {
  const state = await store.read();
  if (request.providerEpoch !== state.providerEpoch)
    return { status: "state-lost", previousEpoch: request.providerEpoch };
  const stored = state.runReceipts[operationStorageKey(request, request.operationId)];
  const receiptThreadId = request.threadId ?? stored?.value.threadId;
  if (receiptThreadId !== undefined) ownedThread(state, request, receiptThreadId);
  const value = lookupReceipt(stored, request.semanticDigest, request.now);
  if (value === undefined)
    return (
      expiredOperationReceipt(request.operationId, request.now) ?? {
        status: "not-found",
        providerEpoch: state.providerEpoch,
      }
    );
  if (value === "expired")
    return {
      status: "expired",
      expiredAt: stored?.expiresAt ?? request.now,
    };
  if (request.threadId !== undefined && value.threadId !== request.threadId)
    throw new LocalAgentStateError("IDEMPOTENCY_CONFLICT", "Receipt belongs to another thread.");
  if (request.runId !== undefined && value.runId !== request.runId)
    throw new LocalAgentStateError("IDEMPOTENCY_CONFLICT", "Receipt belongs to another run.");
  return { status: "found", receipt: value };
}
