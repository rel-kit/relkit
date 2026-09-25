import { Effect } from "effect";
import { makeLocalBatchQueueEffect } from "./batch-queue-effect.js";
import type { LocalBatchQueue, LocalBatchWriter } from "./batch-queue.types.js";
import type { LocalRecord } from "./types.js";
export {
  LocalBatchQueueService,
  localBatchQueueLayer,
  makeLocalBatchQueueEffect,
} from "./batch-queue-effect.js";
export type {
  LocalBatchQueue,
  LocalBatchQueueStats,
  LocalBatchWriter,
} from "./batch-queue.types.js";
/**
 * Creates a bounded queue whose compatibility methods run Effect operations.
 *
 * @param write - Persists one ordered batch; may honor the optional abort signal.
 * @param onFailure - Reports failed writes and rejected records.
 * @returns A queue with enqueue, flush, close, and counters.
 * @example
 * const queue = createLocalBatchQueue(write, reportFailure);
 * await queue.close();
 */
export function createLocalBatchQueue(
  write: LocalBatchWriter,
  onFailure: (error: unknown) => void,
): LocalBatchQueue {
  const queue = Effect.runSync(makeLocalBatchQueueEffect(write, onFailure));
  return Object.freeze({
    enqueue: (record: LocalRecord) => Effect.runSync(queue.enqueue(record)),
    flush: () => Effect.runPromise(queue.flush()),
    close: () => Effect.runPromise(queue.close()),
    stats: () => Effect.runSync(queue.stats()),
  });
}
