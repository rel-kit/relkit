import type { Effect } from "effect";
import type { LocalRecord } from "./types.js";

/**
 * Persists an ordered batch. The signal aborts a write when its Effect is interrupted.
 *
 * @param records - At most 256 records accepted by the queue.
 * @param signal - Cancellation signal for the current write.
 * @returns A Promise that settles after persistence or failure.
 * @example
 * const write: LocalBatchWriter = async (records, signal) => persist(records, signal);
 */
export type LocalBatchWriter = (
  records: readonly LocalRecord[],
  signal?: AbortSignal,
) => Promise<void>;

/** Persisted, failed, dropped, and waiting record counts since queue creation. */
export interface LocalBatchQueueStats {
  readonly persisted: number;
  readonly failed: number;
  readonly dropped: number;
  readonly queued: number;
}

/**
 * Effect operations over a bounded local batch queue.
 * Failed writes are reported through the configured callback and counters.
 *
 * @example
 * const queue = Effect.runSync(makeLocalBatchQueueEffect(write, report));
 * await Effect.runPromise(queue.enqueue(record));
 * await Effect.runPromise(queue.close());
 */
export interface LocalBatchQueueEffects {
  /**
   * Accepts a record or reports a capacity drop.
   * @param record - Valid local record to enqueue.
   * @returns An Effect completing after admission, before persistence.
   * @example
   * yield* queue.enqueue(record);
   */
  readonly enqueue: (record: LocalRecord) => Effect.Effect<void>;
  /**
   * Drains accepted records in order; reports failed writes through the callback.
   * @returns An Effect completing when the current queue is empty.
   * @example
   * yield* queue.flush();
   */
  readonly flush: () => Effect.Effect<void>;
  /**
   * Prevents new admissions and drains the queue once.
   * @returns An Effect completing after queue shutdown.
   * @example
   * yield* queue.close();
   */
  readonly close: () => Effect.Effect<void>;
  /**
   * Reads queue counters without modifying them.
   * @returns An Effect containing a counter snapshot.
   * @example
   * const counts = yield* queue.stats();
   */
  readonly stats: () => Effect.Effect<LocalBatchQueueStats>;
}

/**
 * Promise and synchronous compatibility surface of the queue.
 *
 * @example
 * const queue = createLocalBatchQueue(write, report);
 * queue.enqueue(record);
 * await queue.close();
 */
export interface LocalBatchQueue {
  /**
   * Enqueues a record synchronously.
   * @param record - Record to accept.
   * @returns Nothing after admission or drop.
   * @throws {Error} If record serialization fails.
   * @example
   * queue.enqueue(record);
   */
  readonly enqueue: (record: LocalRecord) => void;
  /**
   * Drains queued records.
   * @returns A Promise resolving after the drain.
   * @example
   * await queue.flush();
   */
  readonly flush: () => Promise<void>;
  /**
   * Closes the queue and drains it.
   * @returns A Promise resolving after shutdown.
   * @example
   * await queue.close();
   */
  readonly close: () => Promise<void>;
  /**
   * Reads queue counters.
   * @returns A snapshot of persisted, failed, dropped, and queued counts.
   * @example
   * const counts = queue.stats();
   */
  readonly stats: () => LocalBatchQueueStats;
}
