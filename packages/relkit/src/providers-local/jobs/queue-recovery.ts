import type { JobStore } from "./store.js";
import { nextEntry, persist } from "./queue-entry.js";
import { assertTime, type JobQueueEntry } from "./queue-utils.js";
import { isLeaseExpired } from "./lease-utils.js";

/** Returns queue entries in deterministic acceptance order.
 * @param entries - Persisted entries in the owning index.
 * @returns Queue entries sorted by acceptance order and identity.
 */
export function orderedQueueEntries(entries: Map<string, JobQueueEntry>): JobQueueEntry[] {
  return [...entries.values()].sort(
    (a, b) => a.order - b.order || a.instanceId.localeCompare(b.instanceId),
  );
}

/** Replays durable records into the queue and reconstructs acceptance ordering.
 * @param store - Owning persisted-state or journal operations.
 * @param entries - Persisted entries in the owning index.
 * @param time - Clock time in milliseconds.
 * @param includeAccepted - Whether recovery also promotes accepted entries.
 * @param clock - Replaceable millisecond clock.
 * @returns Entries whose state changed during recovery.
 */
export async function recoverQueueEntries(
  store: JobStore,
  entries: Map<string, JobQueueEntry>,
  time: number,
  includeAccepted: boolean,
  clock: () => number,
): Promise<readonly JobQueueEntry[]> {
  assertTime(time, includeAccepted ? "recovery time" : "expiry time");
  const recovered: JobQueueEntry[] = [];
  for (const current of orderedQueueEntries(entries)) {
    if (current.state !== "accepted" && !isLeaseExpired(current, time)) continue;
    if (!includeAccepted && current.state === "accepted") continue;
    const next = nextEntry(current, "available", { availableAt: time }, clock);
    await persist(store, next);
    entries.set(current.instanceId, next);
    recovered.push(next);
  }
  return Object.freeze(recovered);
}
