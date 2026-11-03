import { Effect } from "effect";
import { localOperation, type LocalOperationError } from "../local-effect.js";
import type { JobStore } from "../jobs/store.js";
import type { JobQueue } from "../jobs/queue-utils.js";
import { ledger, records } from "./delivery-utils.js";
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
    return Object.freeze({
      cursor: current.checkpoint.sequence,
      records: Object.freeze(records(current.records, triggerId, queue)),
      ledger: ledger(store, triggerId, queue),
      counts: queue.counts(),
      capabilities: EVENT_DELIVERY_CAPABILITIES,
    });
  },
  (effect) => localOperation("EventDelivery.snapshot", effect),
);
