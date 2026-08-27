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

export interface JobQueueAdminMutations {
  readonly adminRetry: (
    instanceId: string,
    options?: JobQueueAdminRetryOptions,
  ) => Promise<JobQueueEntry>;
  readonly adminDeadLetter: (
    instanceId: string,
    failure: JobFailureMetadata,
  ) => Promise<JobQueueEntry>;
}

/** Adds explicit administrative transitions without changing worker transitions. */
export function createJobQueueAdminMutations(
  store: JobStore,
  entries: Map<string, JobQueueEntry>,
  options: {
    readonly clock: () => number;
    readonly serialize: <T>(work: () => Promise<T>) => Promise<T>;
  },
): JobQueueAdminMutations {
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

function getEntry(entries: Map<string, JobQueueEntry>, instanceId: string): JobQueueEntry {
  const normalized = normalizeId(instanceId);
  const entry = entries.get(normalized);
  if (entry === undefined) throw new JobQueueStateError(`Job ${normalized} is unknown`);
  return entry;
}
