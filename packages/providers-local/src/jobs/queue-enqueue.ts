import type { createJobQueueMutations } from "./queue-operations.js";
import type { JobQueueMutations } from "./queue-operations.types.js";
import { Effect } from "effect";
import {
  localOperation,
  localPromise,
  localSync,
  type LocalOperationError,
} from "../local-effect.js";
import { normalizeId } from "@relkit/contracts";
import type { JobStore } from "./store.js";
import { acceptance, prepareIdempotency } from "./idempotency.js";
import { persist } from "./queue-entry.js";
import { makeEntry } from "./queue-entry-create.js";
import {
  assertTime,
  JobQueueStateError,
  type JobQueueEnqueue,
  type JobQueueAcceptance,
  type MutableQueueState,
} from "./queue-utils.js";

/**
 * Creates durable queue admission using the shared serialization permit.
 * @param store - Durable append owner.
 * @param state - Private queue index updated only after persistence.
 * @param options - Clock, identity and idempotency policy.
 * @param serialize - Queue transaction serializer.
 * @returns Admission with stable duplicate detection and acknowledgement ordering.
 */
export function makeQueueEnqueue(
  store: JobStore,
  state: MutableQueueState,
  options: Parameters<typeof createJobQueueMutations>[2],
  serialize: <A>(work: Effect.Effect<A, LocalOperationError>) => Promise<A>,
): JobQueueMutations["enqueue"] {
  /**
   * Validates and deduplicates acceptance before committing the initial queue state.
   * @param input - Caller operation input.
   * @returns The retained or newly accepted durable queue entry.
   */
  const enqueue = (input: JobQueueEnqueue): Promise<JobQueueAcceptance> =>
    serialize(
      Effect.fn("JobQueue.enqueue")(
        function* () {
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
            return yield* localSync(() => {
              throw new JobQueueStateError(`Job ${instanceId} already exists`);
            });
          const entry = makeEntry(
            instanceId,
            "accepted",
            input.input,
            input.profile ?? "default",
            acceptedAt,
            state.nextOrder + 1,
            0,
            input.propagation,
            undefined,
            undefined,
            undefined,
            prepared.record,
          );
          yield* localPromise(() => persist(store, entry));
          state.entries.set(instanceId, entry);
          state.nextOrder = entry.order;
          return acceptance(entry, false);
        },
        (effect) => localOperation("JobQueue.enqueue", effect),
      )(),
    );
  return enqueue;
}
