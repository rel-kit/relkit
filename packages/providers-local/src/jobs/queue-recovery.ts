import type { JobStore } from "./store.js";
import { nextEntry, persist } from "./queue-entry.js";
import { assertTime, type JobQueueEntry } from "./queue-utils.js";
import { isLeaseExpired } from "./lease-utils.js";

export function orderedQueueEntries(entries: Map<string, JobQueueEntry>): JobQueueEntry[] {
  return [...entries.values()].sort(
    (a, b) => a.order - b.order || a.instanceId.localeCompare(b.instanceId),
  );
}

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
