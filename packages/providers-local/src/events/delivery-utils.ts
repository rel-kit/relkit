import { normalizeRetry, positive, json, validateStoredData } from "./delivery-validation.js";
import { normalizeId } from "@relkit/contracts";
import type { JobStore, JobRecord } from "../jobs/store.js";
import { readEntry } from "../jobs/queue-entry.js";
import type { JobQueue, JobQueueEntry } from "../jobs/queue-utils.js";
import type { UnknownEventEnvelope } from "@relkit/events";
import { makeDeliveryId, normalizeEnvelope, type EventDeliveryRecord } from "./router-records.js";
import type { EventDeliveryLedgerRecord, EventDeliveryResult } from "./delivery-types.js";

export { validateStoredData, normalizeRetry, positive, json } from "./delivery-validation.js";

export { DEFAULT_RETRY } from "./delivery-validation.js";

/** Projects a durable queue entry into the public delivery outcome.
 * @param entry - Current queue or storage entry.
 * @param triggerId - Registered trigger identity.
 * @param duplicate - Whether an existing acceptance satisfied this request.
 * @param status - Public lifecycle status.
 * @param error - Failure value to normalize or audit.
 * @param failure - Attempt failure to classify.
 * @param value - Value to validate, normalize or project.
 * @returns The public delivery outcome corresponding to queue state.
 */
export function resultFrom(
  entry: JobQueueEntry,
  triggerId: string,
  duplicate: boolean,
  status: EventDeliveryResult["status"],
  error?: unknown,
  failure?: EventDeliveryResult["failure"],
  value?: unknown,
): EventDeliveryResult {
  return Object.freeze({
    deliveryId: entry.instanceId,
    triggerId,
    eventInstanceId: normalizeEnvelope(entry.input).instanceId,
    accepted: true,
    persisted: true,
    status,
    state: entry.state as EventDeliveryResult["state"],
    attempt: entry.attempt,
    duplicate,
    ...(error === undefined ? {} : { error }),
    ...(failure === undefined ? {} : { failure }),
    ...(value === undefined ? {} : { value }),
  });
}

/** Requeues a dead-letter delivery through the durable queue transition owner.
 * @param queue - Owning durable queue operations.
 * @param triggerId - Registered trigger identity.
 * @param deliveryId - Stable delivery identity.
 * @param now - Current clock time in milliseconds.
 * @returns The requeued delivery outcome after durable transition.
 */
export async function retryDelivery(
  queue: JobQueue,
  triggerId: string,
  deliveryId: string,
  now: () => number,
): Promise<EventDeliveryResult> {
  const normalized = normalizeId(deliveryId);
  await queue.recover(now());
  const entry = await queue.adminRetry(normalized, { availableAt: now() });
  return resultFrom(entry, triggerId, false, "queued");
}

/** Promotes due delayed deliveries before selecting worker work.
 * @param queue - Owning durable queue operations.
 * @param now - Current clock time in milliseconds.
 * @returns A Promise completing after due entries are promoted.
 */
export async function promoteDue(queue: JobQueue, now: () => number): Promise<void> {
  const time = now();
  for (const entry of queue.snapshot()) {
    if (entry.state === "delayed" && (entry.availableAt ?? Number.MAX_SAFE_INTEGER) <= time) {
      await queue.transition(entry.instanceId, "available", {
        expectedState: "delayed",
        availableAt: time,
      });
    }
  }
}

/** Selects validated event-delivery records from the journal snapshot.
 * @param raw - Untrusted input before validation.
 * @param triggerId - Registered trigger identity.
 * @param queue - Owning durable queue operations.
 * @returns Validated delivery records from the journal.
 */
export function records(
  raw: readonly JobRecord[],
  triggerId: string,
  queue: JobQueue,
): EventDeliveryRecord[] {
  return queue.snapshot().map((entry) => {
    const record = [...raw].reverse().find((item) => item.instanceId === entry.instanceId);
    const envelope = normalizeEnvelope(entry.input);
    return Object.freeze({
      version: 1 as const,
      sequence: record?.sequence ?? entry.order,
      timestamp: record?.timestamp ?? entry.acceptedAt,
      deliveryId: entry.instanceId,
      eventInstanceId: envelope.instanceId,
      triggerId,
      envelope,
    });
  });
}

/** Projects durable queue state and envelopes into inspection ledger records.
 * @param store - Owning persisted-state or journal operations.
 * @param triggerId - Registered trigger identity.
 * @param queue - Owning durable queue operations.
 * @returns The delivery inspection ledger.
 */
export function ledger(
  store: Pick<JobStore, "snapshot">,
  triggerId: string,
  queue: JobQueue,
): readonly EventDeliveryLedgerRecord[] {
  return Object.freeze(
    store
      .snapshot()
      .records.filter((record) => queue.get(record.instanceId) !== undefined)
      .filter((record) => record.kind !== "event-delivery-accepted")
      .map((record) => {
        const entry = readEntry(record);
        if (entry === undefined) throw new Error("Event delivery ledger state is invalid");
        const envelope = normalizeEnvelope(entry.input);
        return Object.freeze({
          version: 1 as const,
          sequence: record.sequence,
          timestamp: record.timestamp,
          cursor: record.sequence,
          deliveryId: entry.instanceId,
          eventInstanceId: envelope.instanceId,
          triggerId,
          envelope,
          state: entry.state as EventDeliveryResult["state"],
          attempt: entry.attempt,
          duplicate: entry.attempt > 1,
          ...(entry.leaseOwner === undefined ? {} : { leaseOwner: entry.leaseOwner }),
          ...(entry.leaseExpiresAt === undefined ? {} : { leaseExpiresAt: entry.leaseExpiresAt }),
          ...(entry.failure === undefined ? {} : { failure: entry.failure }),
        });
      }),
  );
}

/** Applies configured backlog overflow admission before durable acceptance.
 * @param queue - Owning durable queue operations.
 * @param envelope - Validated event envelope.
 * @param triggerId - Registered trigger identity.
 * @param profile - Local provider profile partition.
 * @returns The admission decision after enforcing backlog policy.
 */
export async function admitDelivery(
  queue: JobQueue,
  envelope: UnknownEventEnvelope,
  triggerId: string,
  profile: string,
): Promise<{ readonly entry: JobQueueEntry; readonly duplicate: boolean }> {
  const deliveryId = makeDeliveryId(envelope.instanceId, triggerId);
  const existing = queue.get(deliveryId);
  if (existing !== undefined) return { entry: existing, duplicate: true };
  const accepted = await queue.enqueue({
    instanceId: deliveryId,
    input: json(envelope),
    profile,
  });
  // A polling consumer may already have recovered and leased this accepted entry.
  // Recovery promotes only pending acceptance; it never rewinds an active delivery.
  await queue.recover(accepted.acceptedAt);
  return { entry: queue.get(deliveryId)!, duplicate: false };
}
