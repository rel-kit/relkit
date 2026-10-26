/** Pending limits include active writes; wire limits include the complete producer envelope. */
import { expect, test, vi } from "vitest";
import { Effect, Fiber } from "effect";
import { makeLocalBatchQueueEffect } from "../src/local/batch-queue-effect.js";
import { createLocalBatchQueue } from "../src/local/batch-queue.js";
import type { LocalRecord } from "../src/local/types.js";

/** Constructs an independently measured envelope, including its array separator. */
function record(bytes: number): LocalRecord {
  const base: LocalRecord = {
    key: "limit",
    origin: "application",
    record: {
      version: 2,
      signal: "log",
      timestamp: "2026-10-23T00:00:00.000Z",
      level: "info",
      component: "limit",
      message: "",
      fields: {},
    },
  };
  const size = Buffer.byteLength(JSON.stringify(base)) + 1;
  return { ...base, record: { ...base.record, message: "x".repeat(bytes - size) } };
}

/** Blocks one actual write until the test has measured accepted pending work. */
function blockedQueue() {
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const batches: (readonly LocalRecord[])[] = [];
  const queue = createLocalBatchQueue(
    async (batch) => {
      batches.push(batch);
      entered();
      await gate;
    },
    () => {},
  );
  return { queue, release, writing, batches };
}

test("2,048 pending records includes the active batch and rejects the next record", async () => {
  const f = blockedQueue();
  try {
    for (let i = 0; i < 256; i++) f.queue.enqueue(record(256));
    await f.writing;
    for (let i = 256; i < 2048; i++) f.queue.enqueue(record(256));
    expect(f.queue.stats().queued + f.batches[0]!.length).toBe(2048);
    expect(f.queue.stats().dropped).toBe(0);
    f.queue.enqueue(record(256));
    expect(f.queue.stats().dropped).toBe(1);
    expect(f.queue.stats().queued + f.batches[0]!.length).toBe(2048);
  } finally {
    f.release();
    await f.queue.close();
  }
  expect(f.queue.stats()).toMatchObject({ persisted: 2048, queued: 0, dropped: 1 });
});

test.each([0, 1])("four MiB pending plus %s byte includes a blocked active write", async (over) => {
  const f = blockedQueue();
  try {
    f.queue.enqueue(record(900_000));
    const draining = f.queue.flush();
    await f.writing;
    for (let i = 0; i < 3; i++) f.queue.enqueue(record(900_000));
    f.queue.enqueue(record(4_194_304 - 3_600_000 + over));
    expect(f.queue.stats()).toMatchObject({ queued: over === 0 ? 4 : 3, dropped: over });
    f.release();
    await draining;
  } finally {
    f.release();
    await f.queue.close();
  }
  expect(f.queue.stats().persisted).toBe(over === 0 ? 5 : 4);
});

test("all 256 records fit their actual one MiB producer body", async () => {
  const bodies: number[] = [];
  const queue = createLocalBatchQueue(
    async (records) => {
      bodies.push(Buffer.byteLength(JSON.stringify({ records })));
    },
    () => {},
  );
  try {
    for (let i = 0; i < 256; i++) queue.enqueue(record(4096));
    await queue.flush();
    expect(bodies.every((bytes) => bytes <= 1_048_576)).toBe(true);
    expect(queue.stats()).toMatchObject({ persisted: 256, dropped: 0, failed: 0 });
  } finally {
    await queue.close();
  }
});

test("interrupted writes return exact byte reservations before an inclusive capacity retry", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let entered!: () => void;
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let calls = 0;
  const queue = Effect.runSync(
    makeLocalBatchQueueEffect(
      (_records, signal) => {
        if (calls++ > 0) return Promise.resolve();
        return new Promise<void>((_resolve, reject) => {
          signal!.addEventListener("abort", () => reject(new Error("interrupted")), { once: true });
          entered();
        });
      },
      () => {},
    ),
  );
  try {
    Effect.runSync(queue.enqueue(record(900_000)));
    const flushing = Effect.runFork(queue.flush());
    await writing;
    await Effect.runPromise(Fiber.interrupt(flushing));
    for (let i = 0; i < 3; i++) Effect.runSync(queue.enqueue(record(900_000)));
    Effect.runSync(queue.enqueue(record(594_304)));
    expect(Effect.runSync(queue.stats())).toMatchObject({ queued: 5, dropped: 0 });
    await Effect.runPromise(queue.flush());
    expect(Effect.runSync(queue.stats())).toMatchObject({ persisted: 5, queued: 0, dropped: 0 });
  } finally {
    try {
      await Effect.runPromise(queue.close());
    } finally {
      vi.useRealTimers();
    }
  }
});
