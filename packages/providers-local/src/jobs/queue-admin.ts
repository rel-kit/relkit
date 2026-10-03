import type { JobQueueAdminMutations } from "./queue-admin.types.js";
import { normalizeId } from "@relkit/contracts";
import type { JobStore } from "./store.js";
import { nextEntry, persist } from "./queue-entry.js";
import { recoverQueueEntries } from "./queue-recovery.js";
import {
  assertTime,
  JobQueueStateError,
  type JobFailureMetadata,
  type JobQueueAdminRetryOptions,
  type JobQueueEntry,
} from "./queue-utils.js";

export type { JobQueueAdminMutations } from "./queue-admin.types.js";

/** Adds explicit administrative transitions without changing worker transitions.
 * @param store - Owning persisted-state or journal operations.
 * @param entries - Persisted entries in the owning index.
 * @param options - Operation-specific policy, hooks and configuration.
 * @returns Serialized administrative queue transition methods.
 */
export function createJobQueueAdminMutations(
  store: JobStore,
  entries: Map<string, JobQueueEntry>,
  options: {
    readonly clock: () => number;
    readonly serialize: <T>(work: () => Promise<T>) => Promise<T>;
  },
): JobQueueAdminMutations {
  /**
   * Validates retry eligibility and commits an administrative queue retry.
   * @param instanceId - Queue instance identity.
   * @param retryOptions - Retry preconditions and availability settings.
   * @returns The updated queue entry after durable acknowledgement.
   */
  const adminRetry = (
    instanceId: string,
    retryOptions: JobQueueAdminRetryOptions = {},
  ): Promise<JobQueueEntry> =>
    options.serialize(async () => {
      const time = options.clock();
      assertTime(time, "admin retry time");
      await recoverQueueEntries(store, entries, time, false, options.clock);
      const current = getEntry(entries, instanceId);
      if (current.state !== "dead-lettered")
        throw new JobQueueStateError(`Job ${current.instanceId} is not dead-lettered`);
      const availableAt = retryOptions.availableAt ?? time;
      assertTime(availableAt, "admin retry availability time");
      const next = nextEntry(current, "available", { availableAt, attempt: 0 }, options.clock);
      await persist(store, next);
      entries.set(current.instanceId, next);
      return next;
    });

  /**
   * Validates and commits an administrative dead-letter transition.
   * @param instanceId - Queue instance identity.
   * @param failure - Safe failure metadata to retain.
   * @returns The updated terminal queue entry.
   */
  const adminDeadLetter = (
    instanceId: string,
    failure: JobFailureMetadata,
  ): Promise<JobQueueEntry> =>
    options.serialize(async () => {
      const time = options.clock();
      assertTime(time, "admin dead-letter time");
      await recoverQueueEntries(store, entries, time, false, options.clock);
      const current = getEntry(entries, instanceId);
      if (current.state === "completed" || current.state === "dead-lettered")
        throw new JobQueueStateError(`Job ${current.instanceId} is terminal`);
      const next = nextEntry(current, "dead-lettered", { failure }, options.clock);
      await persist(store, next);
      entries.set(current.instanceId, next);
      return next;
    });

  return { adminRetry, adminDeadLetter };
}

/** Resolves the requested queue entry or raises the established missing-entry error.
 * @param entries - Persisted entries in the owning index.
 * @param instanceId - Queue or journal instance identity.
 * @returns The requested queue entry.
 */
function getEntry(entries: Map<string, JobQueueEntry>, instanceId: string): JobQueueEntry {
  const normalized = normalizeId(instanceId);
  const entry = entries.get(normalized);
  if (entry === undefined) throw new JobQueueStateError(`Job ${normalized} is unknown`);
  return entry;
}
