import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocalWorker } from "./src/local/worker-client";
import { createLocalBatchQueue } from "./src/local/batch-queue";
import type { LocalRecord, StoredLocalRecord } from "./src/local/types";
import type { ObservabilityQueryPage } from "./src/query-types";

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

test("trace details expose every retained span through stable pages and the latest summary", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-trace-pages-"));
  const worker = startLocalWorker();
  const startedAt = new Date().toISOString();
  const records: LocalRecord[] = Array.from({ length: 102 }, (_, index) => ({
    key: `span:${index}`,
    origin: "application",
    record: {
      version: 2,
      signal: "span",
      traceId: "30000000000000000000000000000003",
      spanId: (index + 1).toString(16).padStart(16, "0"),
      invocationId: `invocation:${index}`,
      name: "work",
      kind: "internal",
      status: "completed",
      revision: 1,
      startedAt,
    },
  }));
  records.push({
    key: "summary",
    origin: "application",
    record: {
      version: 2,
      signal: "trace",
      traceId: "30000000000000000000000000000003",
      startedAt,
      spanCount: 102,
    },
  });
  records.push({
    key: "request-only",
    origin: "application",
    record: {
      version: 2,
      signal: "request",
      phase: "completed",
      requestId: "request-only",
      originRequestId: "request-only",
      traceId: "40000000000000000000000000000004",
      invocationId: "request-only",
      generationId: "g1",
      graphHash: "hash",
      method: "GET",
      rawPath: "/missing",
      normalizedRoute: "unknown",
      routeId: "unknown",
      functionId: "unknown",
      startedAt,
      completedAt: startedAt,
      durationMs: 0,
      status: 404,
      outcome: "success",
    },
  });
  try {
    await worker.call({ type: "open", root });
    await worker.call({ type: "append", records });
    const traces = await worker.call<ObservabilityQueryPage<StoredLocalRecord>>({
      type: "query",
      kind: "traces",
      query: { limit: 100 },
    });
    expect(traces.items).toHaveLength(2);
    expect(new Set(traces.items.map((record) => record.traceId)).size).toBe(2);
    const detail = await worker.call<{
      trace: { spanCount: number };
      spans: StoredLocalRecord[];
      nextCursor: string;
    }>({ type: "detail", kind: "trace", id: "30000000000000000000000000000003" });
    expect(detail.trace.spanCount).toBe(102);
    const requestOnly = await worker.call<{ spans: unknown[]; records: StoredLocalRecord[] }>({
      type: "detail",
      kind: "trace",
      id: "40000000000000000000000000000004",
    });
    expect(requestOnly.spans).toEqual([]);
    expect(requestOnly.records[0]?.signal).toBe("request");
    expect(detail.spans).toHaveLength(100);
    const rest = await worker.call<ObservabilityQueryPage<StoredLocalRecord>>({
      type: "query",
      kind: "traces",
      query: { traceId: "30000000000000000000000000000003", cursor: detail.nextCursor },
    });
    expect(rest.nextCursor).toBeUndefined();
    expect(
      new Set(
        [...detail.spans, ...rest.items.filter((record) => record.signal === "span")].map(
          (record) => record.cursor,
        ),
      ).size,
    ).toBe(102);
  } finally {
    await worker.close();
    await rm(root, { recursive: true, force: true });
  }
});
