import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type {
  AcceptControlRequest,
  ControlReceipt,
  LookupControlReceiptRequest,
  ReadControlsRequest,
  WaitForControlsRequest,
} from "@relkit/agents";
import { decideThreadTransition } from "@relkit/agents";
import {
  assertOperationReceiptFresh,
  expiredOperationReceipt,
  LocalAgentStateError,
  lookupReceipt,
  operationStorageKey,
  ownedThread,
} from "./common.js";
import { sleep } from "./journal.js";
import { replaceThread } from "./run-state.js";
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
          if (local.activeRunId !== request.runId)
            throw new LocalAgentStateError("NOT_FOUND", "Active run was not found.");
          const action = request.kind === "approve" ? "approve" : request.kind;
          const transition = decideThreadTransition(local.thread.status, action);
          if (!transition.accepted)
            throw new LocalAgentStateError(
              transition.code,
              "Control is invalid for the thread state.",
            );
          const pending = Object.values(local.controls).filter(
            (item) => item.receipt.status === "accepted" || item.receipt.status === "processing",
          );
          if (
            pending.filter((item) => item.receipt.runId === request.runId).length >=
            request.limits.maxQueuedPerRun
          )
            throw new LocalAgentStateError(
              "AGENT_CONTROL_OVERLOADED",
              "Run control queue is full.",
            );
          const applicationPending = Object.values(state.threads)
            .flatMap((thread) => Object.values(thread.controls))
            .filter(
              (item) => item.receipt.status === "accepted" || item.receipt.status === "processing",
            );
          if (applicationPending.length >= request.limits.maxQueuedPerApplication)
            throw new LocalAgentStateError(
              "AGENT_PROVIDER_OVERLOADED",
              "Application control capacity is full.",
            );
          const receipt: ControlReceipt = {
            operationId: request.operationId,
            threadId: request.threadId,
            runId: request.runId,
            status: "accepted",
            effect: "not-started",
            duplicate: false,
          };
          const sequence = local.controlSequence + 1;
          const record = {
            controlId: request.operationId,
            runId: request.runId,
            kind: request.kind,
            semanticDigest: request.semanticDigest,
            publicPayload: request.publicPayload,
            status: "accepted" as const,
            effect: "not-started" as const,
            acceptedAt: request.acceptedAt,
          };
          const item = {
            sequence,
            record,
            receipt,
            semanticDigest: request.semanticDigest,
            expiresAt: request.receiptExpiresAt,
            publicPayload: request.publicPayload,
          };
          const next = {
            ...local,
            controlSequence: sequence,
            controls: { ...local.controls, [request.operationId]: item },
            thread:
              request.kind === "stop"
                ? { ...local.thread, status: "stopping" as const, updatedAt: request.acceptedAt }
                : local.thread,
          };
          return [
            {
              ...replaceThread(state, request.threadId, next),
              controlReceipts: {
                ...state.controlReceipts,
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
    ownedThread(state, request, request.threadId);
    const value = lookupReceipt(
      state.controlReceipts[operationStorageKey(request, request.operationId)],
      request.semanticDigest,
      request.now,
    );
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
    const local = ownedThread(state, request, request.threadId);
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
