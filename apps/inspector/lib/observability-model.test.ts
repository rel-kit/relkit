import { describe, expect, test } from "bun:test";
import {
  mergeLiveItems,
  queryFromFilters,
  requestTimeline,
  traceGroups,
  waterfall,
  EMPTY_SIGNAL_FILTERS,
} from "./observability-model";
import { defaultSignalFilters } from "./signal-defaults";

describe("inspector observability model", () => {
  test("defaults logs to the previous 24 hours", () => {
    const now = Date.parse("2026-08-19T12:00:00.000Z");
    const filters = defaultSignalFilters("logs", now);
    expect(Date.parse(filters.from)).toBe(now - 24 * 60 * 60 * 1_000);
    expect(Date.parse(filters.to)).toBe(now);
    expect(Date.parse(defaultSignalFilters("traces", now).from)).toBe(now - 24 * 60 * 60 * 1_000);
  });

  test("bounds query filters and merges a redacted live record once", () => {
    const query = queryFromFilters(
      { ...EMPTY_SIGNAL_FILTERS, routeId: "orders", from: "2026-08-16T00:00" },
      500,
    );
    expect(query).toMatchObject({ limit: 100, routeId: "orders" });
    expect(query.from).toBe("2026-08-16T00:00:00.000Z");
    const old = { signal: "log", cursor: "1", message: "old" };
    const live = { signal: "log", cursor: "2", message: "safe" };
    expect(mergeLiveItems([old], { data: live })).toEqual([live, old]);
    expect(mergeLiveItems([live, old], { data: live })).toEqual([live, old]);
  });

  test("builds request timelines and parent-aware span waterfalls", () => {
    const request = {
      requestId: "request-1",
      startedAt: "2026-08-16T00:00:00.000Z",
      completedAt: "2026-08-16T00:00:00.010Z",
      timeline: [{ kind: "function", at: "2026-08-16T00:00:00.005Z", targetId: "orders" }],
    };
    expect(requestTimeline(request, []).map((entry) => entry.kind)).toEqual([
      "accepted",
      "function",
      "response",
    ]);
    const spans = waterfall([
      {
        signal: "span",
        spanId: "root",
        name: "http.request",
        startedAt: "2026-08-16T00:00:00.000Z",
        durationMs: 10,
      },
      {
        signal: "span",
        spanId: "child",
        parentSpanId: "root",
        name: "function.invoke",
        startedAt: "2026-08-16T00:00:00.000Z",
        durationMs: 4,
        spanKind: "server",
        requestId: "request-1",
        attributes: { route: "/orders", authorization: "Bearer raw-secret" },
        status: "error",
      },
    ]);
    expect(spans.map((span) => span.spanId)).toEqual(["root", "child"]);
    expect(spans[1]).toMatchObject({ spanId: "child", depth: 1 });
    expect(spans[1]).toMatchObject({ kind: "server", error: true });
    expect(spans[1]?.correlations[0]).toMatchObject({ kind: "request", id: "request-1" });
    expect(JSON.stringify(spans[1]?.details)).not.toContain("raw-secret");
    expect(traceGroups([{ signal: "trace", traceId: "trace-1", spanCount: 1 }])).toHaveLength(1);
  });
});
