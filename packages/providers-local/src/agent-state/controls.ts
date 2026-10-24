/** Admits controls and provides bounded, ordered receipt lookup and polling. */
import { assertControlCapacity, commitControl } from "./control-admission.js";
import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type {
  AcceptControlRequest,
  ControlReceipt,
  LookupControlReceiptRequest,
  ReadControlsRequest,
  WaitForControlsRequest,
} from "@relkit/contracts";

import {
  assertOperationReceiptFresh,
  expiredOperationReceipt,
  LocalAgentStateError,
  lookupReceipt,
  operationStorageKey,
  ownedThread,
} from "./common.js";
import { sleep } from "./journal.js";

import type { AgentStateStoreEffects as AgentStateStore } from "./storage.js";

/**
 * Persists an idempotent control after validating thread lifecycle and capacity.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const acceptControl = Effect.fn("AgentState.acceptControl")(
  function* (store: AgentStateStore, request: AcceptControlRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return store.update<ControlReceipt>((state) => {
          const local = ownedThread(state, request, request.threadId);
          const prior = lookupReceipt(
            state.controlReceipts[operationStorageKey(request, request.operationId)],
            request.semanticDigest,
            request.acceptedAt,
          );
          if (prior !== undefined && prior !== "expired")
            return [state, { ...prior, duplicate: true }] as const;
          if (prior === "expired")
            throw new LocalAgentStateError(
              "IDEMPOTENCY_WINDOW_EXPIRED",
              "Control receipt expired.",
            );
          assertOperationReceiptFresh(request.operationId, request.acceptedAt);
          assertControlCapacity(state, local, request);
          return commitControl(state, local, request);
        });
      }),
    );
  },
  (effect) => localOperation("AgentState.acceptControl", effect),
);

/**
 * Looks up a control receipt and verifies ownership by the requested run.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const lookupControl = Effect.fn("AgentState.lookupControl")(
  function* (store: AgentStateStore, request: LookupControlReceiptRequest) {
    const operationNow = yield* Clock.currentTimeMillis;

    const state = yield* store.read();
    if (request.providerEpoch !== state.providerEpoch)
      return { status: "state-lost" as const, previousEpoch: request.providerEpoch };
    const value = yield* localSync(() => {
      ownedThread(state, request, request.threadId);
      return lookupReceipt(
        state.controlReceipts[operationStorageKey(request, request.operationId)],
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
          state.controlReceipts[operationStorageKey(request, request.operationId)]?.expiresAt ??
          request.now,
      };
    if (value.runId !== request.runId)
      return yield* localSync(() => {
        throw new LocalAgentStateError("IDEMPOTENCY_CONFLICT", "Control belongs to another run.");
      });
    return { status: "found" as const, receipt: value };
  },
  (effect) => localOperation("AgentState.lookupControl", effect),
);

/**
 * Reads pending controls in their persisted acceptance order.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const readControls = Effect.fn("AgentState.readControls")(
  function* (store: AgentStateStore, request: ReadControlsRequest) {
    const operationNow = yield* Clock.currentTimeMillis;

    const state = yield* store.read();
    const local = yield* localSync(() => ownedThread(state, request, request.threadId));
    const after = Number(request.afterSequence ?? 0);
    const items = Object.values(local.controls)
      .filter(
        (item) =>
          item.sequence > after &&
          item.receipt.runId === request.runId &&
          item.receipt.status === "accepted",
      )
      .sort((a, b) => a.sequence - b.sequence)
      .slice(0, request.limit);
    return {
      operationIds: items.map((item) => item.receipt.operationId),
      nextSequence: String(items.at(-1)?.sequence ?? after),
      hasMore: Object.values(local.controls).some(
        (item) =>
          item.sequence > (items.at(-1)?.sequence ?? after) &&
          item.receipt.runId === request.runId &&
          item.receipt.status === "accepted",
      ),
    };
  },
  (effect) => localOperation("AgentState.readControls", effect),
);

/**
 * Waits for eligible controls until its deadline or caller cancellation.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @param pollingMs - Maximum interval between shared-state observations.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const waitForControls = Effect.fn("AgentState.waitForControls")(
  function* (store: AgentStateStore, request: WaitForControlsRequest, pollingMs: number) {
    const operationNow = yield* Clock.currentTimeMillis;

    while ((yield* Clock.currentTimeMillis) < request.deadlineMs) {
      if (request.signal.aborted)
        return yield* localSync(() => {
          throw request.signal.reason;
        });
      if ((yield* readControls(store, { ...request, limit: 1 })).operationIds.length > 0) return;
      yield* sleep(
        Math.min(pollingMs, request.deadlineMs - (yield* Clock.currentTimeMillis)),
        request.signal,
      );
    }
  },
  (effect) => localOperation("AgentState.waitForControls", effect),
);
