import { receipt, makeSnapshot } from "./thread-snapshot.js";
import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type {
  CreateThreadRequest,
  CreateThreadReceipt,
  LoadThreadRequest,
  ReadSnapshotHistoryRequest,
  BrowserMessage,
} from "@relkit/agents";
import {
  encodedBytes,
  LocalAgentStateError,
  operationStorageKey,
  ownedThread,
  scopeKey,
  threadStorageKey,
} from "./common.js";
import { replaceThread } from "./run-state.js";
import type { AgentStateStoreEffects as AgentStateStore } from "./storage.js";

/**
 * Creates or recovers an idempotent thread under its owner and capacity policy.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const createThread = Effect.fn("AgentState.createThread")(
  function* (store: AgentStateStore, request: CreateThreadRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
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
            throw new LocalAgentStateError(
              "AGENT_PRINCIPAL_OVERLOADED",
              "Thread capacity is full.",
            );
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
      }),
    );
  },
  (effect) => localOperation("AgentState.createThread", effect),
);

/**
 * Loads an owned thread and pins public history for bounded pagination.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const loadThread = Effect.fn("AgentState.loadThread")(
  function* (store: AgentStateStore, request: LoadThreadRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
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
            throw new LocalAgentStateError(
              "AGENT_SNAPSHOT_TOO_LARGE",
              "Thread snapshot is too large.",
            );
          const retained = Object.entries(local.snapshots ?? {}).slice(-7);
          const next = replaceThread(state, request.threadId, {
            ...local,
            snapshots: {
              ...Object.fromEntries(retained),
              [snapshotId]: {
                createdAt: new Date(operationNow).toISOString(),
                messages: local.messages.slice(0, firstCurrent),
              },
            },
          });
          return [next, snapshot] as const;
        });
      }),
    );
  },
  (effect) => localOperation("AgentState.loadThread", effect),
);

/**
 * Reads a bounded page from an existing pinned history view.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const readSnapshotHistory = Effect.fn("AgentState.readSnapshotHistory")(
  function* (store: AgentStateStore, request: ReadSnapshotHistoryRequest) {
    const operationNow = yield* Clock.currentTimeMillis;

    const state = yield* store.read();
    const local = ownedThread(state, request, request.threadId);
    const pinned = local.snapshots?.[request.snapshotId];
    if (pinned === undefined)
      return yield* localSync(() => {
        throw new LocalAgentStateError(
          "SNAPSHOT_NOT_FOUND",
          "Pinned thread snapshot was not found.",
        );
      });
    const start = Number(request.cursor);
    if (!Number.isSafeInteger(start) || start < 0 || start > pinned.messages.length)
      return yield* localSync(() => {
        throw new LocalAgentStateError("INVALID_CURSOR", "Snapshot history cursor is invalid.");
      });
    let bytes = 0;
    const messages: BrowserMessage[] = [];
    for (const message of pinned.messages.slice(start)) {
      const size = encodedBytes(message);
      if (bytes + size > request.maxEncodedBytes) break;
      bytes += size;
      messages.push(message);
    }
    if (messages.length === 0 && start < pinned.messages.length)
      return yield* localSync(() => {
        throw new LocalAgentStateError(
          "AGENT_HISTORY_ITEM_TOO_LARGE",
          "History item is too large.",
        );
      });
    const next = start + messages.length;
    return {
      messages,
      ...(next < pinned.messages.length ? { nextCursor: String(next) } : {}),
    };
  },
  (effect) => localOperation("AgentState.readSnapshotHistory", effect),
);
