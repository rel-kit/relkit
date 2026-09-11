import type {
  CompleteRunRequest,
  CompletionReceipt,
  InterruptOwnedRunRequest,
  InterruptionReceipt,
} from "@relkit/agents";
import {
  activeClaim,
  assertOperationReceiptFresh,
  checkpoint,
  encodedBytes,
  LocalAgentStateError,
  lookupReceipt,
  operationStorageKey,
  ownedThread,
} from "./common.js";
import { replaceThread, requireRun } from "./run-state.js";
import type { AgentStateStore } from "./storage.js";

export function completeRun(
  store: AgentStateStore,
  request: CompleteRunRequest,
): Promise<CompletionReceipt> {
  return store.update((state) => {
    const local = ownedThread(state, request, request.threadId);
    const prior = lookupReceipt(
      state.runReceipts[operationStorageKey(request, request.operationId)],
      request.semanticDigest,
      request.settledAt,
    );
    if (prior !== undefined && prior !== "expired" && "checkpoint" in prior)
      return [state, { ...prior, duplicate: true }] as const;
    if (prior === "expired")
      throw new LocalAgentStateError("IDEMPOTENCY_WINDOW_EXPIRED", "Completion receipt expired.");
    assertOperationReceiptFresh(request.operationId, request.settledAt);
    activeClaim(local.runClaims[request.runId], request.claim);
    const run = requireRun(local, request.runId);
    assertTerminalCapacity(local.journal, request.terminalRecord, run);
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
  });
}

export function interruptRun(
  store: AgentStateStore,
  request: InterruptOwnedRunRequest,
): Promise<InterruptionReceipt> {
  return store.update((state) => {
    const local = ownedThread(state, request, request.threadId);
    const run = requireRun(local, request.runId);
    const unchanged = (): readonly [typeof state, InterruptionReceipt] => [
      state,
      {
        threadId: request.threadId,
        runId: request.runId,
        status: "worker-interrupted",
        checkpoint: checkpoint(state, request, request.threadId, local.sequence),
        changed: false,
      },
    ];
    if (["succeeded", "failed", "cancelled", "worker-interrupted"].includes(run.status))
      return unchanged();
    const claim = local.runClaims[request.runId];
    if (
      claim?.claimId !== request.expectedClaimId ||
      claim.fence !== request.expectedFence ||
      run.owner.generationId !== request.expectedOwner.generationId
    )
      return unchanged();
    const sequence = local.sequence + 1;
    const point = checkpoint(state, request, request.threadId, sequence);
    const record = {
      recordId: request.operationId,
      runId: request.runId,
      kind: "interruption" as const,
      publicValue: { reason: request.reason },
      encodedBytes: encodedBytes(request.reason),
      createdAt: request.interruptedAt,
      checkpoint: point,
    };
    return [
      replaceThread(state, request.threadId, {
        ...local,
        sequence,
        activeRunId: request.runId,
        journal: [...local.journal, record],
        runs: {
          ...local.runs,
          [request.runId]: {
            ...run,
            status: "worker-interrupted",
            outcome: "worker-interrupted",
            settledAt: request.interruptedAt,
          },
        },
        thread: { ...local.thread, status: "worker-interrupted", updatedAt: request.interruptedAt },
      }),
      {
        threadId: request.threadId,
        runId: request.runId,
        status: "worker-interrupted",
        checkpoint: point,
        changed: true,
      },
    ] as const;
  });
}

function assertTerminalCapacity(
  journal: readonly { readonly encodedBytes: number }[],
  terminal: { readonly encodedBytes: number },
  run: {
    readonly maxJournalRecordBytes: number;
    readonly terminalReserveBytes: number;
    readonly maxJournalBytes: number;
  },
): void {
  if (
    terminal.encodedBytes > run.maxJournalRecordBytes ||
    encodedBytes(terminal) > run.maxJournalRecordBytes
  )
    throw new LocalAgentStateError("AGENT_OUTPUT_TOO_LARGE", "Terminal record is too large.");
  if (terminal.encodedBytes > run.terminalReserveBytes)
    throw new LocalAgentStateError(
      "AGENT_TERMINAL_RESERVE_EXCEEDED",
      "Terminal record exceeds the reserved capacity.",
    );
  if (
    journal.reduce((sum, record) => sum + record.encodedBytes, 0) + terminal.encodedBytes >
    run.maxJournalBytes
  )
    throw new LocalAgentStateError("AGENT_JOURNAL_OVERLOADED", "Agent journal capacity is full.");
}
