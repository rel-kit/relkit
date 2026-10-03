import { makeQueueEnqueue } from "./queue-enqueue.js";
import { makeQueueSerializer } from "./queue-serialization.js";
import type { JobQueueMutations, JobQueueMutationOptions } from "./queue-operations.types.js";
import { Effect } from "effect";
import { localOperation, localPromise, localSync, runLocal } from "../local-effect.js";
import { normalizeId } from "@relkit/contracts";
import type { JobStore } from "./store.js";
import { nextEntry, persist } from "./queue-entry.js";
import {
  assertTime,
  JobQueueStateError,
  type JobQueueEnqueue,
  type JobQueueEntry,
  type MutableQueueState,
  type JobQueueLeaseOptions,
  type JobQueueState,
  type JobQueueTransitionOptions,
  transitions,
} from "./queue-utils.js";
import { assertLeaseOwner, leaseTransitionOptions } from "./lease-utils.js";
import { acquireQueueLease } from "./queue-lease.js";
import { createJobQueueAdminMutations } from "./queue-admin.js";
import { orderedQueueEntries, recoverQueueEntries } from "./queue-recovery.js";

export type { JobQueueMutations } from "./queue-operations.types.js";

/** Builds serialized durable queue mutation operations over one shared entry index.
 * @param store - Owning persisted-state or journal operations.
 * @param state - Current service-owned state.
 * @param options - Operation-specific policy, hooks and configuration.
 * @returns The queue mutation methods sharing one serialization gate.
 */
export function createJobQueueMutations(
  store: JobStore,
  state: MutableQueueState,
  options: JobQueueMutationOptions,
): JobQueueMutations {
  const serialize = makeQueueSerializer();
  const enqueue = makeQueueEnqueue(store, state, options, serialize);

  /**
   * Recovers due work and claims an available queue entry with a process-owned lease.
   * @param instanceId - Queue instance identity.
   * @param leaseOptions - Ownership and duration settings.
   * @returns The leased entry, or undefined when no eligible work exists.
   */
  const acquire = (
    instanceId?: string,
    leaseOptions: JobQueueLeaseOptions = {},
  ): Promise<JobQueueEntry | undefined> =>
    serialize(
      Effect.fn("JobQueue.acquire")(
        function* () {
          const time = options.clock();
          assertTime(time, "acquisition time");
          yield* localPromise(() =>
            recoverQueueEntries(store, state.entries, time, false, options.clock),
          );
          const current =
            instanceId === undefined
              ? orderedQueueEntries(state.entries).find(
                  (entry) => entry.state === "available" && (entry.availableAt ?? 0) <= time,
                )
              : state.entries.get(normalizeId(instanceId));
          if (current === undefined) {
            if (instanceId === undefined) return undefined;
            return yield* localSync(() => {
              throw new JobQueueStateError(`Job ${instanceId} is unknown`);
            });
          }
          if (current.state !== "available" || (current.availableAt ?? 0) > time)
            return yield* localSync(() => {
              throw new JobQueueStateError(`Job ${current.instanceId} is not available`);
            });
          return yield* localPromise(() =>
            acquireQueueLease(
              store,
              state.entries,
              current,
              time,
              leaseOptions,
              current.attempt + 1,
              options.clock,
              options.ownerToken,
              options.leaseDurationMs,
            ),
          );
        },
        (effect) => localOperation("JobQueue.acquire", effect),
      )(),
    );

  /**
   * Checks current lease ownership and commits its replacement deadline.
   * @param instanceId - Queue instance identity.
   * @param leaseOptions - Ownership and duration settings.
   * @returns The renewed queue entry after durable acknowledgement.
   */
  const renew = (
    instanceId: string,
    leaseOptions: JobQueueLeaseOptions = {},
  ): Promise<JobQueueEntry> =>
    serialize(
      Effect.fn("JobQueue.renew")(
        function* () {
          const time = options.clock();
          assertTime(time, "renewal time");
          yield* localPromise(() =>
            recoverQueueEntries(store, state.entries, time, false, options.clock),
          );
          const current = state.entries.get(normalizeId(instanceId));
          if (current === undefined)
            return yield* localSync(() => {
              throw new JobQueueStateError(`Job ${instanceId} is unknown`);
            });
          if (current.state !== "leased")
            return yield* localSync(() => {
              throw new JobQueueStateError(`Job ${instanceId} is not leased`);
            });
          assertLeaseOwner(current, options.ownerToken);
          const next = nextEntry(
            current,
            "leased",
            leaseTransitionOptions(time, options.leaseDurationMs, leaseOptions, options.ownerToken),
            options.clock,
          );
          yield* localPromise(() => persist(store, next));
          state.entries.set(current.instanceId, next);
          return next;
        },
        (effect) => localOperation("JobQueue.renew", effect),
      )(),
    );

  /**
   * Checks state and ownership preconditions before committing a queue transition.
   * @param instanceId - Queue instance identity.
   * @param target - Required next queue state.
   * @param transitionOptions - Expected state and transition metadata.
   * @returns The updated queue entry after durable acknowledgement.
   */
  const transition = (
    instanceId: string,
    target: JobQueueState,
    transitionOptions: JobQueueTransitionOptions = {},
  ): Promise<JobQueueEntry> =>
    serialize(
      Effect.fn("JobQueue.transition")(
        function* () {
          const time = options.clock();
          assertTime(time, "transition time");
          yield* localPromise(() =>
            recoverQueueEntries(store, state.entries, time, false, options.clock),
          );
          const current = state.entries.get(normalizeId(instanceId));
          if (current === undefined)
            return yield* localSync(() => {
              throw new JobQueueStateError(`Job ${instanceId} is unknown`);
            });
          if (
            transitionOptions.expectedState !== undefined &&
            current.state !== transitionOptions.expectedState
          )
            return yield* localSync(() => {
              throw new JobQueueStateError(
                `Job ${instanceId} is not ${transitionOptions.expectedState}`,
              );
            });
          if (!transitions[current.state].includes(target))
            return yield* localSync(() => {
              throw new JobQueueStateError(`Invalid transition ${current.state} -> ${target}`);
            });
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
          yield* localPromise(() => persist(store, next));
          state.entries.set(current.instanceId, next);
          return next;
        },
        (effect) => localOperation("JobQueue.transition", effect),
      )(),
    );

  /**
   * Recovers abandoned leases and promotes accepted or due work.
   * @param time - Clock time in milliseconds.
   * @returns The entries changed by recovery.
   */
  const recover = (time = options.clock()): Promise<readonly JobQueueEntry[]> =>
    serialize(
      localOperation(
        "JobQueue.recover",
        localPromise(() => recoverQueueEntries(store, state.entries, time, true, options.clock)),
      ),
    );
  /**
   * Processes expired leases and due entries without promoting fresh acceptances.
   * @param time - Clock time in milliseconds.
   * @returns The entries changed by expiry processing.
   */
  const expire = (time = options.clock()): Promise<readonly JobQueueEntry[]> =>
    serialize(
      localOperation(
        "JobQueue.expire",
        localPromise(() => recoverQueueEntries(store, state.entries, time, false, options.clock)),
      ),
    );
  const admin = createJobQueueAdminMutations(store, state.entries, {
    clock: options.clock,
    serialize: (work) => serialize(localPromise(work)),
  });
  const ready = recover(options.clock()).then(() => undefined);
  return {
    ready: () =>
      runLocal(
        localOperation(
          "JobQueue.ready",
          localPromise(() => ready),
        ),
      ),
    enqueue,
    acquire,
    renew,
    transition,
    ...admin,
    recover,
    expire,
  };
}
