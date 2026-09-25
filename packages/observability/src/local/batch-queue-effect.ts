import { Context, Effect, Layer, Metric, Schema, Semaphore } from "effect";
import { observeLocalBatchQueue as observe } from "./batch-queue-metrics.js";
import type {
  LocalBatchQueueEffects,
  LocalBatchQueueStats,
  LocalBatchWriter,
} from "./batch-queue.types.js";
import type { LocalRecord } from "./types.js";
/** A failed batch writer, recorded while the queue continues draining. */
export class LocalBatchWriteError extends Schema.TaggedError<LocalBatchWriteError>()(
  "LocalBatchWriteError",
  { cause: Schema.Defect() },
) {}
/** Injectable local batch queue operations for Effect callers. */
// prettier-ignore
export class LocalBatchQueueService extends Context.Service<
  LocalBatchQueueService,
  LocalBatchQueueEffects
>()("@relkit/observability/LocalBatchQueue") {}
/**
 * Creates a bounded queue whose writes, drain, and metrics run through Effect.
 *
 * @param write - Writer called for ordered batches of at most 256 records.
 * @param onFailure - Notification for rejected or failed records.
 * @returns A live queue with Effect operations and owned timer.
 * @example
 * const queue = Effect.runSync(makeLocalBatchQueueEffect(write, report));
 * await Effect.runPromise(queue.close());
 */
export const makeLocalBatchQueueEffect = Effect.fn("ObservabilityLocalBatch.create")(function* (
  write: LocalBatchWriter,
  onFailure: (error: unknown) => void,
) {
  return yield* observe(
    "create",
    Effect.gen(function* () {
      const permit = yield* Semaphore.make(1);
      const metricRegistry = yield* Metric.MetricRegistry;
      const queue: { record: LocalRecord; bytes: number }[] = [];
      let bytes = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let draining = false;
      let closed = false;
      let failed = 0;
      let dropped = 0;
      let persisted = 0;
      const report = (error: unknown): void => {
        try {
          onFailure(error);
        } catch {
          /* Reporting cannot strand accepted records. */
        }
      };
      const schedule = (): void => {
        timer ??= setTimeout(() => {
          startDrain();
        }, 100);
      };
      const flush = Effect.fn("ObservabilityLocalBatch.flush")(function* () {
        return yield* observe(
          "flush",
          permit.withPermit(
            Effect.gen(function* () {
              clearTimeout(timer);
              timer = undefined;
              while (queue.length > 0) {
                const batch: { record: LocalRecord; bytes: number }[] = [];
                let batchBytes = 0;
                while (
                  queue.length &&
                  batch.length < 256 &&
                  batchBytes + queue[0]!.bytes <= 1024 * 1024
                ) {
                  const next = queue.shift()!;
                  bytes -= next.bytes;
                  batchBytes += next.bytes;
                  batch.push(next);
                }
                const persist = Effect.tryPromise({
                  try: (signal) =>
                    write(
                      batch.map((entry) => entry.record),
                      signal,
                    ),
                  catch: (cause) => new LocalBatchWriteError({ cause }),
                }).pipe(
                  Effect.onInterrupt(() =>
                    Effect.sync(() => {
                      queue.unshift(...batch);
                      bytes += batchBytes;
                      schedule();
                    }),
                  ),
                );
                yield* persist.pipe(
                  Effect.tap(() =>
                    Effect.sync(() => {
                      persisted += batch.length;
                    }),
                  ),
                  Effect.catchTag("LocalBatchWriteError", (error) =>
                    Effect.gen(function* () {
                      failed += batch.length;
                      report(error.cause);
                      yield* Metric.update(
                        Metric.counter("relkit_observability_local_batch_write_failures_total"),
                        batch.length,
                      );
                    }),
                  ),
                );
              }
            }),
          ),
        );
      });
      const startDrain = (): void => {
        if (draining || closed) return;
        draining = true;
        void Effect.runPromise(
          flush().pipe(Effect.provideService(Metric.MetricRegistry, metricRegistry)),
        )
          .catch(report)
          .finally(() => {
            draining = false;
            if (!closed && queue.length > 0) schedule();
          });
      };
      const enqueue = Effect.fn("ObservabilityLocalBatch.enqueue")(function* (record: LocalRecord) {
        yield* observe(
          "enqueue",
          Effect.sync(() => {
            const size = Buffer.byteLength(JSON.stringify(record)) + 1;
            if (closed || size > 1024 * 1024 || bytes + size > 4 * 1024 * 1024) {
              dropped++;
              report(new Error("Telemetry queue capacity exceeded"));
              return;
            }
            bytes += size;
            queue.push({ record, bytes: size });
            if (queue.length >= 256) startDrain();
            else schedule();
          }),
        );
      });
      const close = Effect.fn("ObservabilityLocalBatch.close")(function* () {
        return yield* observe(
          "close",
          Effect.uninterruptible(
            Effect.gen(function* () {
              closed = true;
              yield* flush();
            }),
          ),
        );
      });
      const stats = Effect.fn("ObservabilityLocalBatch.stats")(function* () {
        return yield* observe(
          "stats",
          Effect.sync((): LocalBatchQueueStats => ({
            persisted,
            failed,
            dropped,
            queued: queue.length,
          })),
        );
      });
      return { enqueue, flush, close, stats } satisfies LocalBatchQueueEffects;
    }),
  );
});
/**
 * Provides a queue owned by the Layer scope.
 *
 * @param write - Injectable batch writer.
 * @param onFailure - Best-effort failure notification sink.
 * @returns A Layer that closes the queue at scope release.
 * @example
 * const layer = localBatchQueueLayer(write, report);
 */
export const localBatchQueueLayer = (
  write: LocalBatchWriter,
  onFailure: (error: unknown) => void,
) =>
  Layer.effect(
    LocalBatchQueueService,
    Effect.acquireRelease(makeLocalBatchQueueEffect(write, onFailure), (queue) =>
      Effect.ignore(queue.close()),
    ),
  );
