/**
 * Request history for the browser fixture: the history API's ordering, request filters and
 * opt-in total over the fixture's request list, plus a seeded run of older requests for tests
 * that page and filter. The list is kept newest first, as the live endpoint prepends.
 */
import {
  matchesRequestFilters,
  validateRequestFilters,
  type ObservabilityQueryRequest,
} from "relkit/observability";

type Item = Record<string, unknown>;

/** Matching requests in the requested order, one page of them, and `total` when asked for. */
export function requestsPage(items: readonly Item[], query: ObservabilityQueryRequest) {
  validateRequestFilters(query);
  const search = typeof query.search === "string" ? query.search.trim().toLowerCase() : "";
  const matched = items.filter(
    (item) =>
      matchesRequestFilters(item as never, query) &&
      (search === "" || JSON.stringify(item).toLowerCase().includes(search)),
  );
  // The fixture keeps newest first, which is what the other pages' tests expect when they send
  // no order; only an explicit `asc` reverses it, so `desc` and the default agree.
  const ordered = query.order === "asc" ? [...matched].reverse() : matched;
  const cursor = /^\d+$/.test(String(query.cursor ?? "")) ? Number(query.cursor) : 0;
  const limit = Math.min(query.limit ?? 50, 100);
  const selected = ordered.slice(cursor, cursor + limit);
  return {
    protocol: "relkit.observability.query" as const,
    version: 1 as const,
    items: selected,
    ...(cursor + selected.length < ordered.length
      ? { nextCursor: String(cursor + selected.length) }
      : {}),
    ...(query.count === true || query.count === "true" ? { total: matched.length } : {}),
  } as never;
}

export interface HistorySeedOptions {
  readonly generationId: string;
  readonly graphHash: string;
  readonly routeId: string;
  readonly functionId: string;
  readonly at: string;
}

/** Number of requests the seed adds. */
export const HISTORY_SEED_SIZE = 130;

/**
 * `request-history-001` is the oldest and `request-history-130` the newest. Every tenth
 * request is an unexpected failure (500), otherwise every seventh is a declared error (409
 * `fleet.plate-taken`), otherwise every thirteenth a validation failure (422); the rest are 200s.
 * @returns The records newest first.
 */
export function seedHistoryRequests(options: HistorySeedOptions): readonly Item[] {
  const base = Date.parse(options.at);
  return Array.from({ length: HISTORY_SEED_SIZE }, (_, index) => {
    const n = HISTORY_SEED_SIZE - index;
    const id = `request-history-${String(n).padStart(3, "0")}`;
    const startedAt = new Date(base - (HISTORY_SEED_SIZE - n + 1) * 60_000).toISOString();
    const kind =
      n % 10 === 0 ? "defect" : n % 7 === 0 ? "declared" : n % 13 === 0 ? "invalid" : "ok";
    const outcome = {
      defect: ["defect", 500],
      declared: ["declared-error", 409],
      invalid: ["validation-error", 422],
      ok: ["success", 200],
    }[kind] as [string, number];
    return {
      version: 2,
      signal: "request",
      phase: "completed",
      requestId: id,
      traceId: n.toString(16).padStart(32, "a"),
      generationId: options.generationId,
      graphHash: options.graphHash,
      startedAt,
      completedAt: startedAt,
      durationMs: 5 + (n % 40),
      method: kind === "ok" ? "GET" : "POST",
      rawPath: kind === "declared" ? "/vehicles" : kind === "ok" ? `/orders/${n}` : "/orders",
      normalizedRoute:
        kind === "declared" ? "/vehicles" : kind === "ok" ? "/orders/:orderId" : "/orders",
      routeId: options.routeId,
      functionId: options.functionId,
      status: outcome[1],
      outcome: outcome[0],
      ...(kind === "declared" ? { errorId: "fleet.plate-taken" } : {}),
    };
  });
}

/** Counts a test can compare against what the page shows, computed from the seed itself. */
export function historyCounts(seed: readonly Item[]) {
  const where = (test: (item: Item) => boolean) => seed.filter(test).length;
  return {
    seeded: seed.length,
    serverErrors: where((item) => item.status === 500),
    declared: where((item) => item.errorId === "fleet.plate-taken"),
    posts: where((item) => item.method === "POST"),
  };
}
