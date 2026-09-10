import type {
  AppendChannelEvent,
  AppendReceiptLookup,
  ChannelEventPage,
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
import type { RealtimeStateStore } from "./storage.js";

export function appendEvent(
  store: RealtimeStateStore,
  request: AppendChannelEvent,
): Promise<TriggerReceipt> {
  return store.update((state) => {
    const operationId = request.operationId;
    const prior = operationId === undefined ? undefined : state.receipts[operationId];
    if (prior !== undefined) {
      if (prior.semanticDigest !== request.semanticDigest) {
        throw new LocalRealtimeError("IDEMPOTENCY_CONFLICT", "Operation ID content conflicts.");
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
      checkpoint: checkpoint(request, { ...state, sequence }, sequence, historyStart, expiresAt),
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
                  expiresAt: request.receiptExpiresAt ?? new Date(now + 86_400_000).toISOString(),
                  receipt,
                },
              },
            },
      value: receipt,
    };
  });
}

export async function lookupEventReceipt(
  store: RealtimeStateStore,
  request: LookupAppendReceipt,
): Promise<AppendReceiptLookup> {
  const now = Date.parse(request.now);
  if (operationIdTimestamp(request.operationId) < now - request.receiptWindowMs) {
    return {
      status: "expired",
      expiredAt: new Date(
        operationIdTimestamp(request.operationId) + request.receiptWindowMs,
      ).toISOString(),
    };
  }
  const state = await store.read();
  if (request.providerEpoch !== state.providerEpoch)
    return { status: "state-lost", previousEpoch: request.providerEpoch };
  const found = state.receipts[request.operationId];
  if (found === undefined) return { status: "not-found", providerEpoch: state.providerEpoch };
  if (found.semanticDigest !== request.semanticDigest)
    throw new LocalRealtimeError("IDEMPOTENCY_CONFLICT", "Operation ID content conflicts.");
  return Date.parse(found.expiresAt) <= now
    ? { status: "expired", expiredAt: found.expiresAt }
    : { status: "found", receipt: found.receipt };
}

export async function readEvents(
  store: RealtimeStateStore,
  request: ReadChannelEvents,
): Promise<ChannelEventPage> {
  const state = await store.read();
  const partition = prunePartition(
    state.partitions[partitionKey(request)] ?? emptyPartition(state.sequence),
    Date.now(),
  );
  const tail = partition.events.at(-1)?.sequence ?? state.sequence;
  const expiresAt =
    partition.events.at(-1)?.expiresAt ?? new Date(Date.now() + 300_000).toISOString();
  if (request.after === undefined)
    return {
      events: [],
      checkpoint: checkpoint(request, state, tail, partition.historyStart, expiresAt),
      hasMore: false,
    };
  const gap =
    Date.parse(request.after.expiresAt) <= Date.now()
      ? "expired"
      : scopeGap(request, request.after, state.providerEpoch);
  const after = Number(request.after.sequence);
  const rangeGap =
    after > tail ? "future" : after < partition.historyStart - 1 ? "expired" : undefined;
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
}
