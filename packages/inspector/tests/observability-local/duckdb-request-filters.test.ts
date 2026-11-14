/**
 * The DuckDB history store applies the request filters with the in-memory query's semantics:
 * status (exact and class), method, path prefix and declared error, together and with text
 * search, plus the opt-in `total`, over a seeded history of 3,000 requests with spans and logs.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ObservabilityQueryRequest } from "relkit/observability";
import { openDuckdbDatabase } from "../../src/observability-local/local/duckdb-database.js";

type Database = Awaited<ReturnType<typeof openDuckdbDatabase>>;
type RequestItem = { readonly requestId: string; readonly status: number; readonly method: string; readonly rawPath: string; readonly errorId?: string };

const SEEDED = 3_000;
const seededAt = Date.now();
const methods = ["GET", "POST", "DELETE"] as const;
const paths = ["/orders", "/orders/items", "/shipments", "/api/auth/session"] as const;
const statuses = [200, 201, 404, 409, 422, 500, 503] as const;
const errors: Partial<Record<number, string>> = { 409: "orders.conflict", 500: "orders.unavailable" };
const requests: RequestItem[] = Array.from({ length: SEEDED }, (_, index) => {
  const status = statuses[index % statuses.length]!;
  const errorId = errors[status];
  return {
    requestId: `request-${index}`,
    status,
    method: methods[index % methods.length]!,
    rawPath: `${paths[index % paths.length]!}/${index}`,
    ...(errorId === undefined ? {} : { errorId }),
  };
});

const cases: readonly [string, ObservabilityQueryRequest, (r: RequestItem) => boolean][] = [
  ["exact status", { status: 500 }, (r) => r.status === 500],
  ["status class", { status: "4xx" }, (r) => r.status >= 400 && r.status < 500],
  ["method", { method: "post" }, (r) => r.method === "POST"],
  ["path prefix", { path: "/orders" }, (r) => r.rawPath.startsWith("/orders")],
  ["declared error", { errorId: "orders.conflict" }, (r) => r.errorId === "orders.conflict"],
  [
    "combined with search",
    { status: "5xx", method: "GET", path: "/orders/items", search: "request-1" },
    (r) =>
      r.status >= 500 &&
      r.method === "GET" &&
      r.rawPath.startsWith("/orders/items") &&
      r.requestId.includes("request-1"),
  ],
];

let root: string;
let database: Database;

beforeAll(async () => {
  root = await mkdtemp(join("/tmp", "relkit-duckdb-request-filters-"));
  database = await openDuckdbDatabase(root);
  const records = requests.flatMap(seedRecords);
  // A telemetry batch holds at most 256 records.
  for (let start = 0; start < records.length; start += 255)
    await database.append(records.slice(start, start + 255));
}, 120_000);

afterAll(async () => {
  await database?.close();
  await rm(root, { recursive: true, force: true });
});

describe("request filters of the DuckDB store", () => {
  test.each(cases)("%s selects exactly the matching requests", async (_name, filter, accept) => {
    const expected = requests.filter(accept).map((item) => item.requestId);
    const found: string[] = [];
    let cursor: string | undefined;
    let total: number | undefined;
    do {
      const page = await database.list("requests", {
        ...filter,
        limit: 100,
        ...(cursor === undefined ? { count: true } : { cursor }),
      });
      found.push(...page.items.map((item) => String(item.requestId)));
      total ??= page.total;
      cursor = page.nextCursor;
    } while (cursor !== undefined);
    expect(found).toEqual(expected);
    expect(total).toBe(expected.length);
    expect(expected.length).toBeGreaterThan(0);
  });

  test("total counts every match while a page holds only its limit", async () => {
    const page = await database.list("requests", { status: "5xx", limit: 10, count: "true" });
    expect(page.items).toHaveLength(10);
    expect(page.total).toBe(requests.filter((r) => r.status >= 500).length);
    expect((await database.list("requests", { status: "5xx", limit: 10 })).total).toBeUndefined();
  });

  test("a declared error also finds the traces whose span carries it", async () => {
    const page = await database.list("traces", { errorId: "orders.unavailable", limit: 5, count: true });
    expect(page.total).toBe(requests.filter((r) => r.errorId === "orders.unavailable").length);
  });

  test("status, method and path select no logs", async () => {
    expect((await database.list("logs", { status: 200, count: true })).total).toBe(0);
  });

  test.each([{ status: "600" }, { method: "GET POST" }, { path: "orders" }, { count: "yes" }])(
    "rejects the malformed filter %o",
    async (filter) => {
      await expect(
        database.list("requests", filter as ObservabilityQueryRequest),
      ).rejects.toMatchObject({ code: "RELKIT_OBSERVABILITY_QUERY_INVALID" });
    },
  );
});

/** The completed request, a span and a log of one seeded request. */
function seedRecords(item: RequestItem, index: number) {
  const traceId = (index + 1).toString(16).padStart(32, "0");
  // Recent timestamps: history retention removes old records.
  const timestamp = new Date(seededAt - (SEEDED - index)).toISOString();
  return [
    {
      key: `${item.requestId}:end`,
      origin: "application" as const,
      record: {
        version: 2 as const,
        signal: "request" as const,
        phase: "completed" as const,
        requestId: item.requestId,
        originRequestId: item.requestId,
        traceId,
        startedAt: timestamp,
        completedAt: timestamp,
        durationMs: 1,
        method: item.method,
        rawPath: item.rawPath,
        routeId: "orders.route",
        normalizedRoute: "/orders",
        functionId: "orders.handle",
        invocationId: `invocation-${index}`,
        status: item.status,
        outcome: item.status < 400 ? ("success" as const) : ("declared-error" as const),
        ...(item.errorId === undefined ? {} : { errorId: item.errorId }),
      },
    },
    {
      key: `${item.requestId}:span`,
      origin: "application" as const,
      record: {
        version: 2 as const,
        signal: "span" as const,
        spanId: (index + 1).toString(16).padStart(16, "0"),
        invocationId: `invocation-${index}`,
        traceId,
        name: "orders.handle",
        kind: "internal" as const,
        status: "completed" as const,
        revision: 1,
        startedAt: timestamp,
        ...(item.errorId === undefined ? {} : { attributes: { "relkit.error.id": item.errorId } }),
      },
    },
    {
      key: `${item.requestId}:log`,
      origin: "application" as const,
      record: {
        version: 2 as const,
        signal: "log" as const,
        timestamp,
        level: "info" as const,
        component: "orders",
        message: `handled ${item.requestId}`,
        fields: {},
        requestId: item.requestId,
        traceId,
      },
    },
  ];
}
