/**
 * History queries filter requests by status (exact and class), method, path prefix and declared
 * error, together and with text search, return `total` when asked, and reject malformed filters;
 * checked against a seeded history of 1,000 requests (3,000 records) with spans and logs in the segment store.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createObservabilityIndex,
  createObservabilityQuery,
  createObservabilityRuntime,
  createObservabilitySegmentStore,
  type ObservabilityQuery,
  type ObservabilityQueryRequest,
  type RequestRecord,
} from "../../src/observability/index.ts";
import { FILTER_CASES, seededHistory } from "./query-request-filters-fixture.js";

let root: string;
let close: () => Promise<void>;
let query: ObservabilityQuery;
const seed = seededHistory();

beforeAll(async () => {
  root = await mkdtemp(join("/tmp", "relkit-request-filters-"));
  const index = await createObservabilityIndex({ root });
  const store = await createObservabilitySegmentStore({ root, index });
  const runtime = await createObservabilityRuntime({
    root,
    storage: {
      append: store.append,
      query: createObservabilityQuery(index),
      flush: async () => {
        await store.flush();
        await index.flush();
      },
      close: async () => {
        await store.close();
        await index.close();
      },
    },
  });
  for (const { request, span, log } of seed) {
    runtime.collect(request);
    runtime.collect(span);
    runtime.collect(log);
  }
  await runtime.flush();
  query = runtime.query;
  close = () => runtime.close();
}, 120_000);

afterAll(async () => {
  await close?.();
  await rm(root, { recursive: true, force: true });
});

describe("request filters of the in-memory query", () => {
  test.each(FILTER_CASES)("$name selects exactly the matching requests", async ({ query: filter, accept }) => {
    const expected = seed.map(({ request }) => request).filter(accept);
    const found = await allRequests({ ...filter, count: true });
    expect(found.items.map((item) => item.requestId)).toEqual(expected.map((item) => item.requestId));
    expect(found.total).toBe(expected.length);
    expect(expected.length).toBeGreaterThan(0);
  }, 60_000);

  test("total counts every match while a page holds only its limit", async () => {
    const page = await query.requests({ status: "5xx", limit: 10, count: "true" });
    expect(page.items).toHaveLength(10);
    expect(page.nextCursor).toBeDefined();
    expect(page.total).toBe(seed.filter(({ request }) => request.status! >= 500).length);
    expect((await query.requests({ status: "5xx", limit: 10 })).total).toBeUndefined();
  });

  test("a declared error also finds the spans that carry it", async () => {
    const page = await query.traces({ errorId: "orders.unavailable", limit: 5, count: true });
    expect(page.total).toBeGreaterThan(0);
    expect(page.items.length).toBeGreaterThan(0);
  });

  test.each([
    { status: "600" },
    { status: "5x" },
    { method: "GET POST" },
    { path: "orders" },
    { errorId: "" },
    { count: "yes" },
  ])("rejects the malformed filter %o", async (filter) => {
    await expect(query.requests(filter as ObservabilityQueryRequest)).rejects.toMatchObject({
      code: "RELKIT_OBSERVABILITY_QUERY_INVALID",
    });
  });
});

/** Reads every page of a request query. */
async function allRequests(filter: ObservabilityQueryRequest) {
  const items: RequestRecord[] = [];
  let cursor: string | undefined;
  let total: number | undefined;
  do {
    // The count is asked once, on the first page, as a client would.
    const page = await query.requests({
      ...filter,
      limit: 100,
      ...(cursor === undefined ? {} : { cursor, count: false }),
    });
    items.push(...page.items);
    total ??= page.total;
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return { items, total };
}
