import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocalWorker } from "../src/local/worker-client";
import type { LocalRecord, StoredLocalRecord } from "../src/local/types";
import type { ObservabilityQueryPage } from "../src/query-types";

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
