import type { JobStore } from "./store.js";
import { nextEntry, persist } from "./queue-entry.js";
import type { JobQueueEntry, JobQueueLeaseOptions } from "./queue-utils.js";
import { leaseTransitionOptions } from "./lease-utils.js";

/** Validates availability and ownership, then durably claims one queue entry.
 * @param store - Owning persisted-state or journal operations.
 * @param entries - Persisted entries in the owning index.
 * @param current - Current persisted or projected state.
 * @param time - Clock time in milliseconds.
 * @param leaseOptions - Caller lease ownership and duration settings.
 * @param attempt - One-based completed attempt number.
 * @param clock - Replaceable millisecond clock.
 * @param ownerToken - Token identifying the current lease owner.
 * @param defaultDurationMs - Default lease duration in milliseconds.
 * @returns The durably acquired queue entry.
 */
export async function acquireQueueLease(
  store: JobStore,
  entries: Map<string, JobQueueEntry>,
  current: JobQueueEntry,
  time: number,
  leaseOptions: JobQueueLeaseOptions,
  attempt: number,
  clock: () => number,
  ownerToken: string,
  defaultDurationMs: number,
): Promise<JobQueueEntry> {
  const next = nextEntry(
    current,
    "leased",
    {
      ...leaseTransitionOptions(time, defaultDurationMs, leaseOptions, ownerToken),
      attempt,
    },
    clock,
  );
  await persist(store, next);
  entries.set(current.instanceId, next);
  return next;
}
