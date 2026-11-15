/**
 * Builds the inspection snapshot of one durable event delivery owner: the journal records of its
 * deliveries, their ledger and the queue counts. Router inspection and the provider's `query`
 * call it for every durable trigger. It reads the journal once and the queue twice (entries and
 * counts) per call, whatever the number of stored deliveries, and records no success log:
 * inspection is housekeeping, not application work, while failures still log.
 */
import { Effect } from "effect";
import { ExecutionSuccessLogs } from "../../contracts/operation.js";
import { localOperation, type LocalOperationError } from "../local-effect.js";
import type { JobStore } from "../jobs/store.js";
import type { JobQueue } from "../jobs/queue-utils.js";
import { ledgerFrom, records } from "./delivery-projection.js";
import { EVENT_DELIVERY_CAPABILITIES } from "./delivery-types.js";

/**
 * Joins durable journal and queue state into one safe delivery snapshot.
 * @param store - Recovered durable journal.
 * @param triggerId - Owning trigger identity.
 * @param queue - Owning durable queue.
 * @param ensureOpen - Lifecycle admission check.
 * @returns A lazy immutable snapshot with actual delivery guarantees.
 */
export const deliverySnapshot = Effect.fn("EventDelivery.snapshot")(
  function* (
    store: JobStore,
    triggerId: string,
    queue: JobQueue,
    ensureOpen: () => Effect.Effect<void, LocalOperationError>,
  ) {
    yield* ensureOpen();
    const current = store.snapshot();
    // One queue read serves both projections; the ledger used to read the queue per record.
    const entries = queue.snapshot();
    return Object.freeze({
      cursor: current.checkpoint.sequence,
      records: Object.freeze(records(current.records, triggerId, entries)),
      ledger: ledgerFrom(current.records, triggerId, entries),
      counts: queue.counts(),
      capabilities: EVENT_DELIVERY_CAPABILITIES,
    });
  },
  (effect) =>
    localOperation("EventDelivery.snapshot", effect).pipe(
      Effect.provideService(ExecutionSuccessLogs, false),
    ),
);
