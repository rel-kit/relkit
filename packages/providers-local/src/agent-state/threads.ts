import type {
  CreateThreadRequest,
  CreateThreadReceipt,
  LoadThreadRequest,
  ReadSnapshotHistoryRequest,
  SnapshotHistoryPage,
  ThreadSnapshot,
  StoredRun,
  BrowserMessage,
} from "@relkit/agents";
import {
  checkpoint,
  encodedBytes,
  LocalAgentStateError,
  operationStorageKey,
  ownedThread,
  scopeKey,
  threadStorageKey,
} from "./common.js";
import { replaceThread } from "./run-state.js";
import { journalProjection } from "./snapshot-projection.js";
import type { AgentStateStore } from "./storage.js";

export function createThread(store: AgentStateStore, request: CreateThreadRequest) {
  return store.update<CreateThreadReceipt>((state) => {
    if (request.providerEpoch !== state.providerEpoch) {
      throw new LocalAgentStateError("PROVIDER_STATE_LOST", "Agent provider epoch changed.");
    }
    const receiptKey = operationStorageKey(request, request.operationId);
    const prior = state.createReceipts[receiptKey];
    if (prior !== undefined) {
      if (prior.digest !== request.semanticDigest || prior.threadId !== request.threadId)
        throw new LocalAgentStateError("IDEMPOTENCY_CONFLICT", "Thread request conflicts.");
      const existing = ownedThread(state, request, prior.threadId);
      return [state, receipt(existing.thread)] as const;
    }
    const owned = Object.values(state.threads).filter(
      (item) => item.scopeKey === scopeKey(request),
    );
    const existing = state.threads[threadStorageKey(request, request.threadId)];
    if (existing !== undefined) return [state, receipt(existing.thread)] as const;
    if (owned.length >= request.limits.maxThreadsPerPrincipal)
      throw new LocalAgentStateError("AGENT_PRINCIPAL_OVERLOADED", "Thread capacity is full.");
    const threadId = request.threadId;
    const thread = {
      threadId,
      agentId: request.agentId,
      ownerScope: request.ownerScope,
      status: "idle" as const,
      revision: "0",
      createdAt: request.now,
      updatedAt: request.now,
    };
    return [
      {
        ...state,
        revision: state.revision + 1,
        createReceipts: {
          ...state.createReceipts,
          [receiptKey]: { digest: request.semanticDigest, threadId },
        },
        threads: {
          ...state.threads,
          [threadStorageKey(request, threadId)]: {
            scopeKey: scopeKey(request),
            thread,
            runs: {},
            messages: [],
            approvals: [],
            journal: [],
            controls: {},
            sequence: 0,
            controlSequence: 0,
            nextFence: 0,
            runClaims: {},
            controlClaims: {},
            snapshots: {},
          },
        },
      },
      receipt(thread),
    ] as const;
  });
}

function receipt(thread: {
  readonly threadId: string;
  readonly ownerScope: string;
  readonly createdAt: string;
}): CreateThreadReceipt {
  return { threadId: thread.threadId, ownerScope: thread.ownerScope, createdAt: thread.createdAt };
}

export function loadThread(
  store: AgentStateStore,
  request: LoadThreadRequest,
): Promise<ThreadSnapshot> {
  return store.update((state) => {
    const local = ownedThread(state, request, request.threadId);
    const snapshotId = crypto.randomUUID();
    let firstCurrent = 0;
    let snapshot = makeSnapshot(state, request, local, snapshotId, firstCurrent);
    while (
      encodedBytes(snapshot) > request.maxEncodedBytes &&
      firstCurrent < local.messages.length
    ) {
      firstCurrent += 1;
      snapshot = makeSnapshot(state, request, local, snapshotId, firstCurrent);
    }
    if (encodedBytes(snapshot) > request.maxEncodedBytes)
      throw new LocalAgentStateError("AGENT_SNAPSHOT_TOO_LARGE", "Thread snapshot is too large.");
    const retained = Object.entries(local.snapshots ?? {}).slice(-7);
    const next = replaceThread(state, request.threadId, {
      ...local,
      snapshots: {
        ...Object.fromEntries(retained),
        [snapshotId]: {
          createdAt: new Date().toISOString(),
          messages: local.messages.slice(0, firstCurrent),
        },
      },
    });
    return [next, snapshot] as const;
  });
}

function makeSnapshot(
  state: Awaited<ReturnType<AgentStateStore["read"]>>,
  request: LoadThreadRequest,
  local: ReturnType<typeof ownedThread>,
  snapshotId: string,
  firstCurrent: number,
): ThreadSnapshot {
  const hasOlderHistory = firstCurrent > 0;
  return {
    snapshotId,
    thread: local.thread,
    activeRun:
      local.activeRunId === undefined ? undefined : routing(local.runs[local.activeRunId]!),
    currentRuns: Object.values(local.runs).map(publicRun),
    currentMessages: local.messages.slice(firstCurrent),
    ...journalProjection(local),
    approvals: local.approvals,
    controls: Object.values(local.controls).map((item) => item.record),
    ...(local.waiting === undefined ? {} : { waiting: local.waiting }),
    checkpoint: checkpoint(state, request, request.threadId, local.sequence),
    providerEpoch: state.providerEpoch,
    hasOlderHistory,
    ...(hasOlderHistory ? { olderHistoryCursor: "0" } : {}),
  };
}

function routing(run: StoredRun) {
  return { runId: run.runId, threadId: run.threadId, owner: run.owner };
}

function publicRun(run: StoredRun): StoredRun {
  return {
    ...routing(run),
    operationId: run.operationId,
    status: run.status,
    inputDigest: run.inputDigest,
    acceptedAt: run.acceptedAt,
    ...(run.settledAt === undefined ? {} : { settledAt: run.settledAt }),
    ...(run.outcome === undefined ? {} : { outcome: run.outcome }),
  };
}

export async function readSnapshotHistory(
  store: AgentStateStore,
  request: ReadSnapshotHistoryRequest,
): Promise<SnapshotHistoryPage> {
  const state = await store.read();
  const local = ownedThread(state, request, request.threadId);
  const pinned = local.snapshots?.[request.snapshotId];
  if (pinned === undefined)
    throw new LocalAgentStateError("SNAPSHOT_NOT_FOUND", "Pinned thread snapshot was not found.");
  const start = Number(request.cursor);
  if (!Number.isSafeInteger(start) || start < 0 || start > pinned.messages.length)
    throw new LocalAgentStateError("INVALID_CURSOR", "Snapshot history cursor is invalid.");
  let bytes = 0;
  const messages: BrowserMessage[] = [];
  for (const message of pinned.messages.slice(start)) {
    const size = encodedBytes(message);
    if (bytes + size > request.maxEncodedBytes) break;
    bytes += size;
    messages.push(message);
  }
  if (messages.length === 0 && start < pinned.messages.length)
    throw new LocalAgentStateError("AGENT_HISTORY_ITEM_TOO_LARGE", "History item is too large.");
  const next = start + messages.length;
  return {
    messages,
    ...(next < pinned.messages.length ? { nextCursor: String(next) } : {}),
  };
}
