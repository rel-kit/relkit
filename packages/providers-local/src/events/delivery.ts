import { normalizeId } from "@relkit/contracts";
import type { UnknownEventEnvelope } from "@relkit/events";
import { applyRetry, safeFailureMetadata } from "../jobs/retry.js";
import { createJobQueue } from "../jobs/queue.js";
import type { JobQueueEntry } from "../jobs/queue-utils.js";
import { createJobStore } from "../jobs/store.js";
import { normalizeEnvelope } from "./router-records.js";
import {
  admitDelivery,
  ledger,
  normalizeRetry,
  positive,
  promoteDue,
  records,
  resultFrom,
  retryDelivery,
  validateStoredData,
} from "./delivery-utils.js";
import {
  EVENT_DELIVERY_CAPABILITIES,
  type EventDelivery,
  type EventDeliveryBinding,
  type EventDeliveryLedgerRecord,
  type EventDeliveryOptions,
  type EventDeliveryResult,
  type EventDeliverySnapshot,
} from "./delivery-types.js";

export { EVENT_DELIVERY_CAPABILITIES } from "./delivery-types.js";
export type {
  EventDelivery,
  EventDeliveryBinding,
  EventDeliveryBoundary,
  EventDeliveryLedgerRecord,
  EventDeliveryOptions,
  EventDeliveryResult,
  EventDeliverySnapshot,
} from "./delivery-types.js";
/** Provides durable at-least-once delivery for one compiled event trigger. */
export async function createEventDelivery(
  requestedRoot: string,
  binding: EventDeliveryBinding,
  options: EventDeliveryOptions = {},
): Promise<EventDelivery> {
  const triggerId = normalizeId(binding.id);
  if (typeof binding.invoke !== "function")
    throw new TypeError("Event delivery target is required");
  const requestedConcurrency = options.concurrency ?? binding.concurrency;
  const concurrency =
    requestedConcurrency === undefined ? Infinity : positive(requestedConcurrency, "concurrency");
  const retryPolicy = normalizeRetry(options.retry ?? binding.retry);
  const clock = options.now ?? Date.now;
  const store = await createJobStore(requestedRoot, {
    now: clock,
    ...(options.onBoundary === undefined
      ? {}
      : { onBoundary: (boundary) => options.onBoundary!(boundary) }),
    validateData: validateStoredData,
  });
  const queue = createJobQueue(store, {
    now: clock,
    ...(options.ownerToken === undefined ? {} : { ownerToken: options.ownerToken }),
    ...(options.leaseDurationMs === undefined ? {} : { leaseDurationMs: options.leaseDurationMs }),
  });
  await queue.ready();
  let active = 0;
  let closed = false;
  let admissionTail = Promise.resolve();
  const accept = async (input: UnknownEventEnvelope): Promise<EventDeliveryResult> => {
    ensureOpen();
    const accepted = await admit(normalizeEnvelope(input));
    if (accepted.entry.state === "completed")
      return resultFrom(accepted.entry, triggerId, true, "completed");
    if (accepted.entry.state === "dead-lettered")
      return resultFrom(
        accepted.entry,
        triggerId,
        true,
        "failed",
        undefined,
        accepted.entry.failure,
      );
    return resultFrom(accepted.entry, triggerId, accepted.duplicate, "queued");
  };
  const deliver = async (input: UnknownEventEnvelope): Promise<EventDeliveryResult> => {
    const accepted = await accept(input);
    const result = await runNext(accepted.deliveryId);
    return result === undefined
      ? accepted
      : { ...result, duplicate: result.duplicate || accepted.duplicate };
  };
  const runNext = async (deliveryId?: string): Promise<EventDeliveryResult | undefined> => {
    ensureOpen();
    if (active >= concurrency) return undefined;
    active += 1;
    try {
      await queue.recover(clock());
      await promoteDue(queue, clock);
      const candidate = deliveryId === undefined ? undefined : queue.get(deliveryId);
      if (
        deliveryId !== undefined &&
        (candidate === undefined || candidate.state !== "available")
      ) {
        return undefined;
      }
      const leased = await queue.acquire(deliveryId);
      if (leased === undefined) return undefined;
      const duplicate = leased.attempt > 1;
      let value: unknown;
      try {
        value = await binding.invoke(normalizeEnvelope(leased.input), {
          attempt: leased.attempt,
          replayed: store
            .snapshot()
            .records.some(
              (record) =>
                record.instanceId === leased.instanceId && record.kind === "dead-lettered",
            ),
          ...(binding.timeoutMs === undefined ? {} : { timeoutMs: binding.timeoutMs }),
        });
      } catch (error) {
        const entry = await applyRetry(queue, leased.instanceId, retryPolicy, error, {
          now: clock,
          ...(options.random === undefined ? {} : { random: options.random }),
        });
        return resultFrom(entry, triggerId, duplicate, "failed", error, safeFailureMetadata(error));
      }
      await options.onBoundary?.("handler-success-before-ack");
      const entry = await queue.transition(leased.instanceId, "completed", {
        expectedState: "leased",
      });
      return resultFrom(entry, triggerId, duplicate, "completed", undefined, undefined, value);
    } finally {
      active -= 1;
    }
  };
  const retry = async (deliveryId: string): Promise<EventDeliveryResult> => {
    ensureOpen();
    return retryDelivery(queue, triggerId, deliveryId, clock);
  };
  const recover = async (now = clock()): Promise<readonly EventDeliveryLedgerRecord[]> => {
    ensureOpen();
    await queue.recover(now);
    return ledger(store, triggerId, queue);
  };
  const snapshot = (): EventDeliverySnapshot => {
    ensureOpen();
    const current = store.snapshot();
    return Object.freeze({
      cursor: current.checkpoint.sequence,
      records: Object.freeze(records(current.records, triggerId, queue)),
      ledger: ledger(store, triggerId, queue),
      counts: queue.counts(),
      capabilities: EVENT_DELIVERY_CAPABILITIES,
    });
  };
  const drain = async (): Promise<readonly EventDeliveryResult[]> => {
    const results: EventDeliveryResult[] = [];
    while (true) {
      const result = await runNext();
      if (result === undefined) return Object.freeze(results);
      results.push(result);
    }
  };
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await store.close();
  };
  return Object.freeze({
    triggerId,
    capabilities: EVENT_DELIVERY_CAPABILITIES,
    accept,
    deliver,
    runNext,
    retry,
    drain,
    recover,
    snapshot,
    close,
  });
  async function admit(envelope: UnknownEventEnvelope): Promise<{
    readonly entry: JobQueueEntry;
    readonly duplicate: boolean;
  }> {
    const result = admissionTail.then(async () => {
      return admitDelivery(queue, envelope, triggerId, binding.profile ?? "default");
    });
    admissionTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function ensureOpen(): void {
    if (closed) throw new Error("Event delivery is closed");
  }
}
