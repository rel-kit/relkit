import { expect, test } from "vitest";
import { Effect, Fiber, Metric } from "effect";
import {
  LocalBatchQueueService,
  localBatchQueueLayer,
  makeLocalBatchQueueEffect,
} from "../src/local/batch-queue-effect.js";
import type { LocalRecord } from "../src/local/types.js";
const record: LocalRecord = {
  key: "effect:1",
  origin: "application",
  record: {
    version: 2,
    signal: "log",
    timestamp: "2026-09-25T00:00:00.000Z",
    level: "info",
    component: "test",
    message: "effect queue",
  },
};
test("the queue Layer substitutes a writer and records operation metrics", async () => {
  const written: string[] = [];
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const queue = yield* LocalBatchQueueService;
      yield* queue.enqueue(record);
      yield* queue.flush();
      const stats = yield* queue.stats();
      const count = yield* Metric.value(
        Metric.counter("relkit_observability_local_batch_operations_total", {
          attributes: { operation: "flush", outcome: "success" },
        }),
      );
      return { stats, count };
    }).pipe(
      Effect.provide(
        localBatchQueueLayer(
          async (batch) => {
            written.push(...batch.map((entry) => entry.key));
          },
          () => undefined,
        ),
      ),
      Effect.provideService(Metric.MetricRegistry, registry),
    ),
  );
  expect(written).toEqual(["effect:1"]);
  expect(result.stats).toMatchObject({ persisted: 1, queued: 0 });
  expect(result.count.count).toBe(1);
});
test("interrupting the exported flush aborts its writer and retains the batch", async () => {
  let started!: () => void;
  const writing = new Promise<void>((resolve) => {
    started = resolve;
  });
  let calls = 0;
  let aborted = false;
  const queue = Effect.runSync(
    makeLocalBatchQueueEffect(
      (_batch, signal) => {
        if (++calls > 1) return Promise.resolve();
        return new Promise<void>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("aborted"));
            },
            { once: true },
          );
          started();
        });
      },
      () => undefined,
    ),
  );
  Effect.runSync(queue.enqueue(record));
  const fiber = Effect.runFork(queue.flush());
  await writing;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(aborted).toBe(true);
  expect(Effect.runSync(queue.stats()).queued).toBe(1);
  await Effect.runPromise(queue.flush());
  expect(Effect.runSync(queue.stats())).toMatchObject({ persisted: 1, queued: 0 });
  await Effect.runPromise(queue.close());
});
test("failed writes stay visible in counters and bounded telemetry", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const queue = yield* makeLocalBatchQueueEffect(
        async () => {
          throw new Error("disk failed");
        },
        () => undefined,
      );
      yield* queue.enqueue(record);
      yield* queue.flush();
      const stats = yield* queue.stats();
      const failures = yield* Metric.value(
        Metric.counter("relkit_observability_local_batch_write_failures_total"),
      );
      yield* queue.close();
      return { stats, failures };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.stats).toMatchObject({ failed: 1, queued: 0 });
  expect(result.failures.count).toBe(1);
});
test("a full queue coalesces background drains and retains its metric registry", async () => {
  const registry = new Map();
  let started!: () => void;
  let release!: () => void;
  const writing = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = Effect.runSync(
    makeLocalBatchQueueEffect(
      async () => {
        started();
        await gate;
      },
      () => undefined,
    ).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  for (let index = 0; index < 512; index++) {
    Effect.runSync(
      queue
        .enqueue({ ...record, key: `effect:${index}` })
        .pipe(Effect.provideService(Metric.MetricRegistry, registry)),
    );
  }
  await writing;
  release();
  await Effect.runPromise(
    queue.close().pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  const count = Effect.runSync(
    Metric.value(
      Metric.counter("relkit_observability_local_batch_operations_total", {
        attributes: { operation: "flush", outcome: "success" },
      }),
    ).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(Effect.runSync(queue.stats()).persisted).toBe(512);
  expect(count.count).toBeLessThanOrEqual(3);
});
