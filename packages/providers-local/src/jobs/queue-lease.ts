import type { JobStore } from "./store.js";
import { nextEntry, persist } from "./queue-entry.js";
import type { JobQueueEntry, JobQueueLeaseOptions } from "./queue-utils.js";
import { leaseTransitionOptions } from "./lease-utils.js";

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
