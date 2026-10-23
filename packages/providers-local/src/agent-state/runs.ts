/** Admits idempotent runs and resolves retained receipts within their ownership and expiration windows. */
import { assertRunCapacity, commitRunAdmission } from "./run-admission.js";
import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type {
  AcceptRunReceipt,
  AcceptRunRequest,
  LookupRunReceiptRequest,
} from "@relkit/contracts";
import {
  assertOperationReceiptFresh,
  expiredOperationReceipt,
  LocalAgentStateError,
  lookupReceipt,
  operationStorageKey,
  ownedThread,
} from "./common.js";

import type { AgentStateStoreEffects as AgentStateStore } from "./storage.js";

/**
 * Admits an idempotent run after enforcing thread, journal and provider capacity.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const acceptRun = Effect.fn("AgentState.acceptRun")(
  function* (store: AgentStateStore, request: AcceptRunRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
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
          assertRunCapacity(state, local, request);
          return commitRunAdmission(state, local, request);
        });
      }),
    );
  },
  (effect) => localOperation("AgentState.acceptRun", effect),
);

/**
 * Resolves a run operation against its semantic digest and receipt retention window.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const lookupRunReceipt = Effect.fn("AgentState.lookupRunReceipt")(
  function* (store: AgentStateStore, request: LookupRunReceiptRequest) {
    const operationNow = yield* Clock.currentTimeMillis;

    const state = yield* store.read();
    if (request.providerEpoch !== state.providerEpoch)
      return { status: "state-lost" as const, previousEpoch: request.providerEpoch };
    const stored = state.runReceipts[operationStorageKey(request, request.operationId)];
    const receiptThreadId = request.threadId ?? stored?.value.threadId;
    const value = yield* localSync(() => {
      if (receiptThreadId !== undefined) ownedThread(state, request, receiptThreadId);
      return lookupReceipt(stored, request.semanticDigest, request.now);
    });
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
        expiredAt: stored?.expiresAt ?? request.now,
      };
    if (request.threadId !== undefined && value.threadId !== request.threadId)
      return yield* localSync(() => {
        throw new LocalAgentStateError(
          "IDEMPOTENCY_CONFLICT",
          "Receipt belongs to another thread.",
        );
      });
    if (request.runId !== undefined && value.runId !== request.runId)
      return yield* localSync(() => {
        throw new LocalAgentStateError("IDEMPOTENCY_CONFLICT", "Receipt belongs to another run.");
      });
    return { status: "found" as const, receipt: value };
  },
  (effect) => localOperation("AgentState.lookupRunReceipt", effect),
);
