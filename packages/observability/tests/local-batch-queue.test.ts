import { expect, test } from "vitest";
import { createLocalBatchQueue } from "../src/local/batch-queue.js";
import type { LocalRecord } from "../src/local/types.js";

const record = (key: string): LocalRecord => ({
  key,
  origin: "application",
  record: {
    version: 2,
    signal: "log",
    timestamp: "2026-09-25T00:00:00.000Z",
    level: "info",
    component: "test",
    message: key,
  },
});

test("flush includes records accepted while a drain is settling", async () => {
  let release!: () => void;
  const firstWrite = new Promise<void>((resolve) => {
    release = resolve;
  });
  const written: string[] = [];
  const queue = createLocalBatchQueue(
    async (batch) => {
      if (written.length === 0) await firstWrite;
      written.push(...batch.map((entry) => entry.key));
    },
    () => undefined,
  );
  queue.enqueue(record("first"));
  const flush = queue.flush();
  release();
  queueMicrotask(() => queue.enqueue(record("second")));
  await flush;
  expect(written).toEqual(["first", "second"]);
  expect(queue.stats().queued).toBe(0);
  await queue.close();
});

test("failure reporting cannot strand the next accepted batch", async () => {
  let writes = 0;
  const queue = createLocalBatchQueue(
    async () => {
      if (++writes === 1) throw new Error("storage failed");
    },
    () => {
      throw new Error("reporting failed");
    },
  );
  queue.enqueue(record("first"));
  await queue.flush();
  queue.enqueue(record("second"));
  await queue.close();
  expect(queue.stats()).toMatchObject({ failed: 1, persisted: 1, queued: 0 });
});
