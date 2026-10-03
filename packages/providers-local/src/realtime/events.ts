import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type {
  AppendChannelEvent,
  LookupAppendReceipt,
  ReadChannelEvents,
  TriggerReceipt,
} from "@relkit/realtime";
import { operationIdTimestamp } from "@relkit/realtime";
import {
  checkpoint,
  encodedBytes,
  emptyPartition,
  LocalRealtimeError,
  partitionKey,
  prunePartition,
  scopeGap,
} from "./common.js";
import type { RealtimeStateStoreEffects as RealtimeStateStore } from "./storage.js";
/**
 * Appends an idempotent channel event with retention and capacity enforcement.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const appendEvent = Effect.fn("Realtime.appendEvent")(
  function* (store: RealtimeStateStore, request: AppendChannelEvent) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return store.update((state) => {
          const operationId = request.operationId;
          const prior = operationId === undefined ? undefined : state.receipts[operationId];
          if (prior !== undefined) {
            if (prior.semanticDigest !== request.semanticDigest) {
              throw new LocalRealtimeError(
                "IDEMPOTENCY_CONFLICT",
                "Operation ID content conflicts.",
              );
            }
            return { state, value: { ...prior.receipt, duplicate: true } };
          }
          const key = partitionKey(request);
          if (
            state.partitions[key] === undefined &&
            Object.keys(state.partitions).length >= request.limits.maxPartitions
          ) {
            throw new LocalRealtimeError(
              "REALTIME_PROVIDER_OVERLOADED",
              "Realtime partition capacity is full.",
            );
          }
          const now = Date.parse(request.occurredAt);
          const original = state.partitions[key] ?? emptyPartition(state.sequence);
          const current = prunePartition(original, now);
          const sequence = state.sequence + 1;
          const expiresAt = new Date(now + (request.retentionMs ?? 300_000)).toISOString();
          const baseEvent = {
            sequence,
            eventId: `${state.providerEpoch}:${sequence}`,
            event: request.event,
            payload: request.payload,
            createdAt: request.occurredAt,
            expiresAt,
          };
          const provisional = { ...baseEvent, encodedBytes: 0 };
          const selected = [...current.events, provisional].slice(
            -(request.maxEvents ?? Number.MAX_SAFE_INTEGER),
          );
          const historyStart = selected[0]?.sequence ?? sequence + 1;
          const eventBytes = encodedBytes({
            kind: "event",
            event: request.event,
            payload: request.payload,
            checkpoint: checkpoint(
              request,
              { ...state, sequence },
              sequence,
              historyStart,
              expiresAt,
            ),
          });
          if (eventBytes > request.limits.maxEventBytes)
            throw new LocalRealtimeError("REALTIME_EVENT_TOO_LARGE", "Channel event is too large.");
          const event = { ...baseEvent, encodedBytes: eventBytes };
          const events = [...selected.slice(0, -1), event];
          const removed = current.events.filter((entry) => !events.includes(entry));
          const expiredBytes = original.events
            .filter((entry) => !current.events.includes(entry))
            .reduce((sum, item) => sum + item.encodedBytes, 0);
          const retainedBytes =
            state.retainedBytes -
            expiredBytes -
            removed.reduce((sum, item) => sum + item.encodedBytes, 0) +
            eventBytes;
          if (retainedBytes > request.limits.maxRetainedBytes) {
            throw new LocalRealtimeError(
              "REALTIME_PROVIDER_OVERLOADED",
              "Retained channel capacity is full.",
            );
          }
          const nextHistoryStart = events[0]?.sequence ?? sequence + 1;
          const next = {
            ...state,
            sequence,
            revision: state.revision + 1,
            retainedBytes,
            partitions: {
              ...state.partitions,
              [key]: { ...current, historyStart: nextHistoryStart, events },
            },
          };
          const receipt: TriggerReceipt = {
            accepted: true,
            ...(operationId === undefined ? {} : { operationId }),
            eventId: event.eventId,
            checkpoint: checkpoint(request, next, sequence, nextHistoryStart, expiresAt),
            profile: request.profile,
            providerEpoch: state.providerEpoch,
            duplicate: false,
          };
          return {
            state:
              operationId === undefined
                ? next
                : {
                    ...next,
                    receipts: {
                      ...state.receipts,
                      [operationId]: {
                        semanticDigest: request.semanticDigest ?? "",
                        expiresAt:
                          request.receiptExpiresAt ?? new Date(now + 86_400_000).toISOString(),
                        receipt,
                      },
                    },
                  },
            value: receipt,
          };
        });
      }),
    );
  },
  (effect) => localOperation("Realtime.appendEvent", effect),
);
/**
 * Resolves an append receipt within its semantic and temporal recovery window.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const lookupEventReceipt = Effect.fn("Realtime.lookupEventReceipt")(
  function* (store: RealtimeStateStore, request: LookupAppendReceipt) {
    const operationNow = yield* Clock.currentTimeMillis;

    const now = Date.parse(request.now);
    if (operationIdTimestamp(request.operationId) < now - request.receiptWindowMs) {
      return {
        status: "expired" as const,
        expiredAt: new Date(
          operationIdTimestamp(request.operationId) + request.receiptWindowMs,
        ).toISOString(),
      };
    }
    const state = yield* store.read();
    if (request.providerEpoch !== state.providerEpoch)
      return { status: "state-lost" as const, previousEpoch: request.providerEpoch };
    const found = state.receipts[request.operationId];
    if (found === undefined)
      return { status: "not-found" as const, providerEpoch: state.providerEpoch };
    if (found.semanticDigest !== request.semanticDigest)
      return yield* localSync(() => {
        throw new LocalRealtimeError("IDEMPOTENCY_CONFLICT", "Operation ID content conflicts.");
      });
    return Date.parse(found.expiresAt) <= now
      ? { status: "expired" as const, expiredAt: found.expiresAt }
      : { status: "found" as const, receipt: found.receipt };
  },
  (effect) => localOperation("Realtime.lookupEventReceipt", effect),
);
/**
 * Reads ordered retained events with checkpoint continuity and byte bounds.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const readEvents = Effect.fn("Realtime.readEvents")(
  function* (store: RealtimeStateStore, request: ReadChannelEvents) {
    const operationNow = yield* Clock.currentTimeMillis;

    const state = yield* store.read();
    const partition = prunePartition(
      state.partitions[partitionKey(request)] ?? emptyPartition(state.sequence),
      operationNow,
    );
    const tail = partition.events.at(-1)?.sequence ?? state.sequence;
    const expiresAt =
      partition.events.at(-1)?.expiresAt ?? new Date(operationNow + 300_000).toISOString();
    if (request.after === undefined)
      return {
        events: [],
        checkpoint: checkpoint(request, state, tail, partition.historyStart, expiresAt),
        hasMore: false,
      };
    const gap =
      Date.parse(request.after.expiresAt) <= operationNow
        ? ("expired" as const)
        : scopeGap(request, request.after, state.providerEpoch);
    const after = Number(request.after.sequence);
    const rangeGap =
      after > tail
        ? ("future" as const)
        : after < partition.historyStart - 1
          ? ("expired" as const)
          : undefined;
    const detectedGap = gap ?? rangeGap;
    if (detectedGap !== undefined)
      return {
        events: [],
        checkpoint: checkpoint(request, state, tail, partition.historyStart, expiresAt),
        hasMore: false,
        gap: detectedGap,
      };
    let bytes = 0;
    const selected = partition.events
      .filter((event) => event.sequence > after)
      .slice(0, request.limit)
      .filter((event) => {
        if (bytes + event.encodedBytes > request.maxEncodedBytes) return false;
        bytes += event.encodedBytes;
        return true;
      });
    const last = selected.at(-1)?.sequence ?? after;
    return {
      events: selected.map((event) => ({
        ...event,
        checkpoint: checkpoint(request, state, event.sequence, partition.historyStart, expiresAt),
      })),
      checkpoint: checkpoint(request, state, last, partition.historyStart, expiresAt),
      hasMore: partition.events.some((event) => event.sequence > last),
    };
  },
  (effect) => localOperation("Realtime.readEvents", effect),
);
