import { normalizeId } from "@zsys/contracts";
import type { JobStore } from "./store.js";
import { acceptance, prepareIdempotency } from "./idempotency.js";
import { makeEntry, nextEntry, persist } from "./queue-entry.js";
import {
  assertTime,
  JobQueueStateError,
  type JobQueueEnqueue,
  type JobQueueAcceptance,
  type JobQueueEntry,
  type JobQueue,
  type JobQueueLeaseOptions,
  type JobQueueState,
  type JobQueueTransitionOptions,
  transitions,
} from "./queue-utils.js";
import { assertLeaseOwner, leaseTransitionOptions } from "./lease-utils.js";
import { acquireQueueLease } from "./queue-lease.js";
import { createJobQueueAdminMutations, type JobQueueAdminMutations } from "./queue-admin.js";
import { orderedQueueEntries, recoverQueueEntries } from "./queue-recovery.js";
export interface MutableQueueState {
  readonly entries: Map<string, JobQueueEntry>;
  nextOrder: number;
}
export type JobQueueMutations = Pick<
  JobQueue,
  "ready" | "enqueue" | "acquire" | "renew" | "transition" | "recover" | "expire"
> &
  JobQueueAdminMutations;

export function createJobQueueMutations(
  store: JobStore,
  state: MutableQueueState,
  options: {
    readonly clock: () => number;
    readonly createInstanceId?: () => string;
    readonly ownerToken: string;
    readonly leaseDurationMs: number;
    readonly idempotency?: JobQueueEnqueue["idempotency"];
  },
): JobQueueMutations {
  let tail = Promise.resolve();
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const enqueue = (input: JobQueueEnqueue): Promise<JobQueueAcceptance> =>
    serialize(async () => {
      const now = options.clock();
      assertTime(now, "enqueue time");
      const acceptedAt = input.acceptedAt ?? now;
      const prepared = prepareIdempotency(
        input.input,
        input.idempotency ?? options.idempotency,
        state.entries.values(),
        now,
        acceptedAt,
      );
      if (prepared.duplicate !== undefined) return prepared.duplicate;
      const instanceId = normalizeId(input.instanceId ?? options.createInstanceId?.());
      if (state.entries.has(instanceId))
        throw new JobQueueStateError(`Job ${instanceId} already exists`);
      const entry = makeEntry(
        instanceId,
        "accepted",
        input.input,
        input.profile ?? "default",
        acceptedAt,
        state.nextOrder + 1,
        0,
        undefined,
        undefined,
        undefined,
        prepared.record,
      );
      await persist(store, entry);
      state.entries.set(instanceId, entry);
      state.nextOrder = entry.order;
      return acceptance(entry, false);
    });
  const acquire = (
    instanceId?: string,
    leaseOptions: JobQueueLeaseOptions = {},
  ): Promise<JobQueueEntry | undefined> =>
    serialize(async () => {
      const time = options.clock();
      assertTime(time, "acquisition time");
      await recoverQueueEntries(store, state.entries, time, false, options.clock);
      const current =
        instanceId === undefined
          ? orderedQueueEntries(state.entries).find(
              (entry) => entry.state === "available" && (entry.availableAt ?? 0) <= time,
            )
          : state.entries.get(normalizeId(instanceId));
      if (current === undefined) {
        if (instanceId === undefined) return undefined;
        throw new JobQueueStateError(`Job ${instanceId} is unknown`);
      }
      if (current.state !== "available" || (current.availableAt ?? 0) > time)
        throw new JobQueueStateError(`Job ${current.instanceId} is not available`);
      return acquireQueueLease(
        store,
        state.entries,
        current,
        time,
        leaseOptions,
        current.attempt + 1,
        options.clock,
        options.ownerToken,
        options.leaseDurationMs,
      );
    });
  const renew = (
    instanceId: string,
    leaseOptions: JobQueueLeaseOptions = {},
  ): Promise<JobQueueEntry> =>
    serialize(async () => {
      const time = options.clock();
      assertTime(time, "renewal time");
      await recoverQueueEntries(store, state.entries, time, false, options.clock);
      const current = state.entries.get(normalizeId(instanceId));
      if (current === undefined) throw new JobQueueStateError(`Job ${instanceId} is unknown`);
      if (current.state !== "leased")
        throw new JobQueueStateError(`Job ${instanceId} is not leased`);
      assertLeaseOwner(current, options.ownerToken);
      const next = nextEntry(
        current,
        "leased",
        leaseTransitionOptions(time, options.leaseDurationMs, leaseOptions, options.ownerToken),
        options.clock,
      );
      await persist(store, next);
      state.entries.set(current.instanceId, next);
      return next;
    });
  const transition = (
    instanceId: string,
    target: JobQueueState,
    transitionOptions: JobQueueTransitionOptions = {},
  ): Promise<JobQueueEntry> =>
    serialize(async () => {
      const time = options.clock();
      assertTime(time, "transition time");
      await recoverQueueEntries(store, state.entries, time, false, options.clock);
      const current = state.entries.get(normalizeId(instanceId));
      if (current === undefined) throw new JobQueueStateError(`Job ${instanceId} is unknown`);
      if (
        transitionOptions.expectedState !== undefined &&
        current.state !== transitionOptions.expectedState
      )
        throw new JobQueueStateError(`Job ${instanceId} is not ${transitionOptions.expectedState}`);
      if (!transitions[current.state].includes(target))
        throw new JobQueueStateError(`Invalid transition ${current.state} -> ${target}`);
      if (current.state === "leased") assertLeaseOwner(current, options.ownerToken);
      const next = nextEntry(
        current,
        target,
        target === "leased"
          ? {
              ...leaseTransitionOptions(
                time,
                options.leaseDurationMs,
                transitionOptions,
                options.ownerToken,
              ),
              ...(transitionOptions.attempt === undefined
                ? {}
                : { attempt: transitionOptions.attempt }),
            }
          : transitionOptions,
        options.clock,
      );
      await persist(store, next);
      state.entries.set(current.instanceId, next);
      return next;
    });
  const recover = (time = options.clock()): Promise<readonly JobQueueEntry[]> =>
    serialize(() => recoverQueueEntries(store, state.entries, time, true, options.clock));
  const expire = (time = options.clock()): Promise<readonly JobQueueEntry[]> =>
    serialize(() => recoverQueueEntries(store, state.entries, time, false, options.clock));
  const admin = createJobQueueAdminMutations(store, state.entries, {
    clock: options.clock,
    serialize,
  });
  const ready = recover(options.clock()).then(() => undefined);
  return {
    ready: () => ready,
    enqueue,
    acquire,
    renew,
    transition,
    ...admin,
    recover,
    expire,
  };
}
