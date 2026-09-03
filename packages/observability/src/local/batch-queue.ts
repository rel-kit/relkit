import type { LocalRecord } from "./types.js";

/** Bounded batching, with flush acknowledging only completed writes. */
export function createLocalBatchQueue(
  write: (records: readonly LocalRecord[]) => Promise<void>,
  onFailure: (error: unknown) => void,
) {
  const queue: { record: LocalRecord; bytes: number }[] = [];
  let bytes = 0;
  let pending: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let failed = 0;
  let dropped = 0;
  let persisted = 0;
  const drain = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (pending) return pending;
    pending = (async () => {
      while (queue.length) {
        const batch: LocalRecord[] = [];
        let batchBytes = 0;
        while (queue.length && batch.length < 256 && batchBytes + queue[0]!.bytes <= 1024 * 1024) {
          const next = queue.shift()!;
          bytes -= next.bytes;
          batchBytes += next.bytes;
          batch.push(next.record);
        }
        try {
          await write(batch);
          persisted += batch.length;
        } catch (error) {
          failed += batch.length;
          onFailure(error);
        }
      }
    })().finally(() => {
      pending = undefined;
    });
    return pending;
  };
  return {
    enqueue: (record: LocalRecord): void => {
      const size = Buffer.byteLength(JSON.stringify(record)) + 1;
      if (closed || size > 1024 * 1024 || bytes + size > 4 * 1024 * 1024) {
        dropped++;
        onFailure(new Error("Telemetry queue capacity exceeded"));
        return;
      }
      bytes += size;
      queue.push({ record, bytes: size });
      if (queue.length >= 256) void drain();
      else timer ??= setTimeout(() => void drain(), 100);
    },
    flush: drain,
    close: async () => {
      closed = true;
      await drain();
    },
    stats: () => ({ persisted, failed, dropped, queued: queue.length }),
  };
}
