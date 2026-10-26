/** Owns local agent-state thread create while preserving persisted identities. */
import type { LocalAgentState } from "./state.js";
import { receipt } from "./thread-snapshot.js";
import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type { CreateThreadRequest, CreateThreadReceipt } from "@relkit/contracts";
import {
  LocalAgentStateError,
  operationStorageKey,
  ownedThread,
  scopeKey,
  threadStorageKey,
} from "./common.js";

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
          return commitThread(state, request, receiptKey);
        });
      }),
    );
  },
  (effect) => localOperation("AgentState.createThread", effect),
);

/**
 * Constructs a fresh owned thread after receipt and capacity checks.
 * @param state - Snapshot supplied by the owning atomic store update.
 * @param request - Validated scoped request, including operation identity and capacity policy.
 * @param receiptKey - Scope-qualified operation key whose absence was already checked.
 * @returns The next snapshot and receipt for a newly owned empty thread.
 */
export function commitThread(
  state: LocalAgentState,
  request: CreateThreadRequest,
  receiptKey: string,
) {
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
}
