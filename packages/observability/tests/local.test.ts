import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocalWorker } from "../src/local/worker-client";
import { createLocalBatchQueue } from "../src/local/batch-queue";
import type { LocalRecord, StoredLocalRecord } from "../src/local/types";
import type { ObservabilityQueryPage } from "../src/query-types";

const item = (
  key: string,
  message = "Repeated message",
  timestamp = new Date().toISOString(),
): LocalRecord => ({
  key,
  origin: "application",
  record: {
    version: 2,
    signal: "log",
    level: "debug",
    timestamp,
    component: "orders",
    requestId: "same-request",
    traceId: "10000000000000000000000000000001",
    message,
    fields: { password: "must-not-persist", customer: "Alice" },
  },
});

test("Node DuckDB worker preserves history, retries, repeated records, cursors, search, and ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-duckdb-"));
  let worker = startLocalWorker();
  const other = startLocalWorker();
  try {
    await worker.call({ type: "open", root });
    await expect(other.call({ type: "open", root })).rejects.toThrow();
    const batch = [item("1"), item("2"), item("3", "Other message")];
    const committed = await worker.call<StoredLocalRecord[]>({ type: "append", records: batch });
    expect(committed).toHaveLength(3);
    expect(JSON.stringify(committed)).not.toContain("must-not-persist");
    expect(await worker.call({ type: "append", records: batch })).toEqual([]);
    const first = await worker.call<ObservabilityQueryPage<StoredLocalRecord>>({
      type: "query",
      kind: "logs",
      query: { order: "desc", limit: 2 },
    });
    expect(first.items.map((record) => record.cursor)).toEqual(["3", "2"]);
    await worker.call({ type: "append", records: [item("4")] });
    const second = await worker.call<ObservabilityQueryPage<StoredLocalRecord>>({
      type: "query",
      kind: "logs",
      query: { order: "desc", cursor: first.nextCursor!, limit: 2 },
    });
    expect(second.items.map((record) => record.cursor)).toEqual(["1"]);
    await worker.close();
    worker = startLocalWorker();
    await worker.call({ type: "open", root });
    const page = await worker.call<ObservabilityQueryPage<StoredLocalRecord>>({
      type: "query",
      kind: "logs",
      query: { search: "ALICE", source: "application", severity: "debug" },
    });
    expect(page.items).toHaveLength(4);
    const detail = await worker.call<{ log: StoredLocalRecord }>({
      type: "detail",
      kind: "log",
      id: "1",
    });
    expect(detail.log.cursor).toBe("1");
    await worker.call({ type: "retention", retention: { maxEntries: 2 } });
    expect(await worker.call({ type: "detail", kind: "log", id: "1" })).toBeUndefined();
    await worker.call({ type: "retention", retention: { maxBytes: 1 } });
    expect(
      (
        await worker.call<ObservabilityQueryPage<StoredLocalRecord>>({
          type: "query",
          kind: "logs",
          query: {},
        })
      ).items,
    ).toHaveLength(0);
  } finally {
    await Promise.allSettled([worker.close(), other.close()]);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("batch queue flush waits for commit and reports failed or dropped writes", async () => {
  let release!: () => void;
  const commit = new Promise<void>((resolve) => {
    release = resolve;
  });
  const failures: unknown[] = [];
  const queue = createLocalBatchQueue(
    () => commit,
    (error) => failures.push(error),
  );
  queue.enqueue(item("1"));
  const flush = queue.flush();
  expect(queue.stats().persisted).toBe(0);
  release();
  await flush;
  expect(queue.stats().persisted).toBe(1);
  queue.enqueue(item("oversized", "x".repeat(1024 * 1024)));
  expect(queue.stats().dropped).toBe(1);
  await queue.close();
  const broken = createLocalBatchQueue(
    async () => {
      throw new Error("disk failed");
    },
    (error) => failures.push(error),
  );
  broken.enqueue(item("2"));
  await broken.flush();
  expect(broken.stats()).toMatchObject({ persisted: 0, failed: 1 });
  expect(failures).toHaveLength(2);
  await broken.close();
});
