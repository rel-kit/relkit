import { randomUUID } from "node:crypto";
import { Effect } from "effect";
import { nativeNow } from "../native-services.js";
import { localOperation, localSync, runLocalSync } from "../local-effect.js";
import { normalizeId } from "@relkit/contracts";
import type { JobStore } from "./store.js";
import { readEntry } from "./queue-entry.js";
import { createJobQueueMutations } from "./queue-operations.js";
import type { MutableQueueState } from "./queue-utils.js";
import { validateIdempotencyDefinition } from "./idempotency.js";
import {
  JOB_QUEUE_STATES,
  JobQueueStateError,
  assertTime,
  transitions,
  type JobQueue,
  type JobQueueCounts,
  type JobQueueEntry,
  type JobQueueOptions,
  type JobQueueState,
} from "./queue-utils.js";
import {
  assertLeaseDuration,
  DEFAULT_LEASE_DURATION_MS,
  normalizeOwnerToken,
} from "./lease-utils.js";

export { JOB_QUEUE_STATES, JobQueueStateError } from "./queue-utils.js";
export type * from "./queue-utils.js";

/** Provides durable queue state plus process-owned leases.
 * @param store - Owning persisted-state or journal operations.
 * @param options - Operation-specific policy, hooks and configuration.
 * @returns The durable queue mutation and inspection interface.
 */
export function createJobQueue(store: JobStore, options: JobQueueOptions = {}): JobQueue {
  const clock = options.now ?? nativeNow;
  const ownerToken = normalizeOwnerToken(options.ownerToken ?? randomUUID());
  const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
  const idempotency =
    options.idempotency === undefined
      ? undefined
      : validateIdempotencyDefinition(options.idempotency);
  assertLeaseDuration(leaseDurationMs);
  const state: MutableQueueState = { entries: new Map(), nextOrder: 0 };
  for (const record of store.snapshot().records) {
    const entry = readEntry(record);
    if (entry === undefined) continue;
    const prior = state.entries.get(entry.instanceId);
    if (
      prior !== undefined &&
      prior.state !== entry.state &&
      !transitions[prior.state].includes(entry.state)
    )
      throw new JobQueueStateError(`Invalid transition ${prior.state} -> ${entry.state}`);
    state.entries.set(entry.instanceId, entry);
    state.nextOrder = Math.max(state.nextOrder, entry.order);
  }
  const mutations = createJobQueueMutations(store, state, {
    clock,
    createInstanceId: options.createInstanceId ?? randomUUID,
    ownerToken,
    leaseDurationMs,
    idempotency,
  });
  /**
   * Sorts queue entries by acceptance order and stable instance identity.
   * @returns A new ordered entry array.
   */
  const ordered = (): JobQueueEntry[] =>
    [...state.entries.values()].sort(
      (a, b) => a.order - b.order || a.instanceId.localeCompare(b.instanceId),
    );
  /**
   * Selects currently eligible available entries using validated time and bounds.
   * @param limit - Maximum number of selected entries.
   * @param time - Clock time in milliseconds.
   * @returns The immutable bounded selection.
   */
  const selectAvailable = (
    limit = Number.MAX_SAFE_INTEGER,
    time = clock(),
  ): readonly JobQueueEntry[] => {
    assertTime(time, "selection time");
    if (!Number.isSafeInteger(limit) || limit < 0)
      throw new JobQueueStateError("Selection limit is invalid");
    return Object.freeze(
      ordered()
        .filter((entry) => entry.state === "available" && (entry.availableAt ?? 0) <= time)
        .slice(0, limit),
    );
  };
  /**
   * Counts entries by their current durable queue lifecycle state.
   * @returns The immutable state-count record.
   */
  const counts = (): JobQueueCounts => {
    const result = Object.fromEntries(JOB_QUEUE_STATES.map((state) => [state, 0])) as Record<
      JobQueueState,
      number
    >;
    for (const entry of state.entries.values()) result[entry.state] += 1;
    return Object.freeze(result);
  };
  return Object.freeze({
    ownerToken,
    ready: mutations.ready,
    enqueue: mutations.enqueue,
    acquire: mutations.acquire,
    renew: mutations.renew,
    transition: mutations.transition,
    adminRetry: mutations.adminRetry,
    adminDeadLetter: mutations.adminDeadLetter,
    recover: mutations.recover,
    expire: mutations.expire,
    selectAvailable: (limit?: number, time?: number) =>
      runLocalSync(
        localOperation(
          "JobQueue.selectAvailable",
          localSync(() => selectAvailable(limit, time)),
        ),
      ),
    get: (instanceId: string) =>
      runLocalSync(
        localOperation(
          "JobQueue.get",
          localSync(() => state.entries.get(normalizeId(instanceId))),
        ),
      ),
    counts: () => runLocalSync(localOperation("JobQueue.counts", Effect.sync(counts))),
    snapshot: () =>
      runLocalSync(
        localOperation(
          "JobQueue.snapshot",
          Effect.sync(() => Object.freeze(ordered())),
        ),
      ),
  });
}
