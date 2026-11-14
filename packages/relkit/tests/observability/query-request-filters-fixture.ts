/**
 * Seeded request history for the request filters: 1,000 completed requests with varied status,
 * method, path and declared error, each with one span (failed ones carry `relkit.error.id`) and
 * one log, plus the expected matches of a filter computed directly from the seed.
 */
import type { RequestRecord, SpanRecord, LogRecord } from "../../src/observability/index.ts";

const methods = ["GET", "POST", "DELETE"] as const;
const paths = ["/orders", "/orders/items", "/shipments", "/api/auth/session"] as const;
const statuses = [200, 201, 404, 409, 422, 500, 503] as const;
const errors: Partial<Record<number, string>> = { 409: "orders.conflict", 500: "orders.unavailable" };

/** Number of seeded requests. */
export const SEEDED_REQUESTS = Number(process.env.SEEDED_REQUESTS ?? 1_000);

/** One seeded request with its span and log. */
export interface SeededRequest {
  readonly request: RequestRecord;
  readonly span: SpanRecord;
  readonly log: LogRecord;
}

/** Builds the deterministic seed. */
export function seededHistory(): SeededRequest[] {
  return Array.from({ length: SEEDED_REQUESTS }, (_, index) => {
    const status = statuses[index % statuses.length]!;
    const requestId = `request-${index}`;
    const traceId = (index + 1).toString(16).padStart(32, "0");
    const timestamp = new Date(Date.UTC(2026, 10, 1, 0, 0, 0, index)).toISOString();
    const errorId = errors[status];
    const request: RequestRecord = {
      version: 2,
      signal: "request",
      phase: "completed",
      requestId,
      traceId,
      generationId: "generation.test",
      graphHash: "sha256:test",
      startedAt: timestamp,
      completedAt: timestamp,
      durationMs: 1,
      method: methods[index % methods.length]!,
      rawPath: `${paths[index % paths.length]!}/${index}`,
      routeId: "orders.route",
      functionId: "orders.handle",
      status,
      outcome: status < 400 ? "success" : status >= 500 ? "defect" : "declared-error",
      ...(errorId === undefined ? {} : { errorId }),
    };
    const span: SpanRecord = {
      version: 2,
      signal: "span",
      spanId: (index + 1).toString(16).padStart(16, "0"),
      invocationId: `invocation-${index}`,
      traceId,
      name: "orders.handle",
      kind: "internal",
      status: "completed",
      revision: 1,
      startedAt: timestamp,
      ...(errorId === undefined ? {} : { attributes: { "relkit.error.id": errorId } }),
    } as SpanRecord;
    const log: LogRecord = {
      version: 2,
      signal: "log",
      timestamp,
      level: "info",
      component: "orders",
      message: `handled ${requestId}`,
      fields: {},
      requestId,
      traceId,
    } as LogRecord;
    return { request, span, log };
  });
}

/** Filters of the request filter checks, with the predicate a correct store must agree with. */
export const FILTER_CASES: readonly {
  readonly name: string;
  readonly query: Readonly<Record<string, string | number | boolean>>;
  readonly accept: (request: RequestRecord) => boolean;
}[] = [
  { name: "exact status", query: { status: 500 }, accept: (r) => r.status === 500 },
  { name: "status class", query: { status: "4xx" }, accept: (r) => r.status! >= 400 && r.status! < 500 },
  { name: "method", query: { method: "post" }, accept: (r) => r.method === "POST" },
  { name: "path prefix", query: { path: "/orders" }, accept: (r) => r.rawPath.startsWith("/orders") },
  { name: "declared error", query: { errorId: "orders.conflict" }, accept: (r) => r.errorId === "orders.conflict" },
  {
    name: "combined with search",
    query: { status: "5xx", method: "GET", path: "/orders/items", search: "request-1" },
    accept: (r) =>
      r.status! >= 500 &&
      r.method === "GET" &&
      r.rawPath.startsWith("/orders/items") &&
      r.requestId.includes("request-1"),
  },
];
