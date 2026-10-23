/** Admits and looks up idempotent waiting or approval continuations within atomic storage updates. */
import { prepareContinuation, commitContinuation } from "./continuation-admission.js";
import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type { AdmitContinuationRequest, LookupContinuationReceiptRequest } from "@relkit/contracts";

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
 * Admits a continuation with matching approval or waiting identity.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const admitContinuation = Effect.fn("AgentState.admitContinuation")(
  function* (store: AgentStateStore, request: AdmitContinuationRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return store.update((state) => {
          const local = ownedThread(state, request, request.threadId);
          const prior = lookupReceipt(
            state.continuationReceipts[operationStorageKey(request, request.operationId)],
            request.semanticDigest,
            request.admittedAt,
          );
          if (prior !== undefined && prior !== "expired") {
            if (
              prior.threadId !== request.threadId ||
              prior.interruptedRunId !== request.interruptedRunId ||
              prior.interruptSetDigest !== request.interruptSetDigest ||
              (request.kind === "resume"
                ? prior.waitingRevision !== request.waitingRevision
                : prior.waitingRevision !== undefined)
            ) {
              throw new LocalAgentStateError(
                "IDEMPOTENCY_CONFLICT",
                "Continuation receipt belongs to another waiting contract.",
              );
            }
            return [state, { ...prior, duplicate: true }] as const;
          }
          if (prior === "expired") {
            throw new LocalAgentStateError(
              "IDEMPOTENCY_WINDOW_EXPIRED",
              "Continuation receipt expired.",
            );
          }
          assertOperationReceiptFresh(request.operationId, request.admittedAt);
          const interrupted = local.runs[request.interruptedRunId];
          if (interrupted === undefined) {
            throw new LocalAgentStateError("NOT_FOUND", "Interrupted run was not found.");
          }
          const { ready, approvals } = prepareContinuation(local, interrupted, request);
          return commitContinuation(state, local, interrupted, request, ready, approvals);
        });
      }),
    );
  },
  (effect) => localOperation("AgentState.admitContinuation", effect),
);

/**
 * Resolves a continuation receipt using its scope and semantic identity.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const lookupContinuation = Effect.fn("AgentState.lookupContinuation")(
  function* (store: AgentStateStore, request: LookupContinuationReceiptRequest) {
    const operationNow = yield* Clock.currentTimeMillis;

    const state = yield* store.read();
    if (request.providerEpoch !== state.providerEpoch) {
      return { status: "state-lost" as const, previousEpoch: request.providerEpoch };
    }
    const value = yield* localSync(() => {
      ownedThread(state, request, request.threadId);
      return lookupReceipt(
        state.continuationReceipts[operationStorageKey(request, request.operationId)],
        request.semanticDigest,
        request.now,
      );
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
        expiredAt:
          state.continuationReceipts[operationStorageKey(request, request.operationId)]
            ?.expiresAt ?? request.now,
      };
    if (
      (request.interruptedRunId !== undefined &&
        value.interruptedRunId !== request.interruptedRunId) ||
      (request.interruptSetDigest !== undefined &&
        value.interruptSetDigest !== request.interruptSetDigest)
    ) {
      return yield* localSync(() => {
        throw new LocalAgentStateError("IDEMPOTENCY_CONFLICT", "Continuation identity conflicts.");
      });
    }
    return { status: "found" as const, receipt: value };
  },
  (effect) => localOperation("AgentState.lookupContinuation", effect),
);
