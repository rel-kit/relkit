/**
 * Projects one durable delivery owner's journal records and queue entries into the public
 * inspection records and ledger. Delivery snapshots, recovery and router inspection call these
 * with data they already read, so a projection performs no provider operation of its own.
 *
 * Journal records and queue entries are deep-frozen and never change once written, so the
 * normalized envelope of an entry input and the ledger record of a journal record are computed
 * once and reused by later inspections (weakly held: they disappear with the record). Without
 * this every inspection re-serialized and re-validated every stored delivery.
 */
import { normalizeId } from "../../contracts/index.js";
import type { UnknownEventEnvelope } from "../../events/index.js";
import type { JobRecord, JobStore } from "../jobs/store.js";
import { readEntry } from "../jobs/queue-entry.js";
import type { JobQueue, JobQueueEntry } from "../jobs/queue-utils.js";
import { normalizeEnvelope, type EventDeliveryRecord } from "./router-records.js";
import type { EventDeliveryLedgerRecord, EventDeliveryResult } from "./delivery-types.js";

/** Normalized envelopes keyed by the frozen queue input they were read from. */
const envelopes = new WeakMap<object, UnknownEventEnvelope>();

/** Ledger records keyed by their frozen journal record, with the trigger they were built for. */
const ledgerRecords = new WeakMap<
  JobRecord,
  { readonly triggerId: string; readonly value: EventDeliveryLedgerRecord }
>();

/** Selects validated event-delivery records from the journal snapshot.
 * @param raw - Untrusted input before validation.
 * @param triggerId - Registered trigger identity.
 * @param entries - One snapshot of the owning durable queue, read once by the caller.
 * @returns Validated delivery records from the journal.
 * @remarks The latest journal record of each delivery is indexed once, so the projection is
 * linear in the stored records instead of searching the journal for every queue entry.
 */
export function records(
  raw: readonly JobRecord[],
  triggerId: string,
  entries: readonly JobQueueEntry[],
): EventDeliveryRecord[] {
  const latest = new Map<string, JobRecord>();
  for (const record of raw) latest.set(record.instanceId, record);
  return entries.map((entry) => {
    const record = latest.get(entry.instanceId);
    const envelope = envelopeOf(entry.input);
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
  queue: Pick<JobQueue, "snapshot">,
): readonly EventDeliveryLedgerRecord[] {
  return ledgerFrom(store.snapshot().records, triggerId, queue.snapshot());
}

/** Projects already-read journal records and queue entries into inspection ledger records.
 * @param raw - Journal records of one store snapshot.
 * @param triggerId - Registered trigger identity.
 * @param entries - One snapshot of the owning durable queue.
 * @returns The delivery inspection ledger.
 * @remarks Membership is checked against that one queue snapshot: reading the queue once per
 * stored record made every inspection cost one provider operation per delivery.
 */
export function ledgerFrom(
  raw: readonly JobRecord[],
  triggerId: string,
  entries: readonly JobQueueEntry[],
): readonly EventDeliveryLedgerRecord[] {
  // The queue entry holds the same envelope every journal record of its delivery carries.
  const queued = new Map(entries.map((entry) => [entry.instanceId, entry]));
  return Object.freeze(
    raw
      .filter((record) => queued.has(normalizeId(record.instanceId)))
      .filter((record) => record.kind !== "event-delivery-accepted")
      .map((record) =>
        ledgerRecord(record, triggerId, queued.get(normalizeId(record.instanceId))!),
      ),
  );
}

/** Reads or builds the ledger record of one journal record.
 * @param record - Frozen journal record of a queued delivery.
 * @param triggerId - Registered trigger identity.
 * @param current - Current queue entry of the same delivery, whose input is the delivery envelope.
 * @returns The immutable ledger record.
 */
function ledgerRecord(
  record: JobRecord,
  triggerId: string,
  current: JobQueueEntry,
): EventDeliveryLedgerRecord {
  const cached = ledgerRecords.get(record);
  if (cached?.triggerId === triggerId) return cached.value;
  const entry = readEntry(record);
  if (entry === undefined) throw new Error("Event delivery ledger state is invalid");
  // A delivery's envelope never changes after acceptance, so it is normalized once per delivery.
  const envelope = envelopeOf(current.input);
  const value: EventDeliveryLedgerRecord = Object.freeze({
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
  ledgerRecords.set(record, { triggerId, value });
  return value;
}

/** Normalizes a stored delivery input once per frozen input object.
 * @param input - Queue entry input holding the accepted event envelope.
 * @returns The normalized, frozen event envelope.
 */
function envelopeOf(input: JobQueueEntry["input"]): UnknownEventEnvelope {
  if (typeof input !== "object" || input === null) return normalizeEnvelope(input);
  const cached = envelopes.get(input);
  if (cached !== undefined) return cached;
  const envelope = normalizeEnvelope(input);
  envelopes.set(input, envelope);
  return envelope;
}
