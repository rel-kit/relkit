import { describe, expect, test } from "bun:test";
import type { WaterfallEvent, WaterfallSpan } from "./observability-trace-model";
import {
  barGeometry,
  lifecyclePhases,
  rulerTicks,
  shortEventName,
  traceClock,
  traceRows,
  traceStepTotal,
  traceSummary,
} from "./trace-view";

const at = (ms: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, ms)).toISOString();
const event = (name: string, ms: number): WaterfallEvent => ({
  name,
  timestamp: at(ms),
  offsetPercent: 0,
});
const span = (
  value: Partial<WaterfallSpan> & Pick<WaterfallSpan, "id" | "name">,
): WaterfallSpan => ({
  recordType: "span",
  traceId: "t",
  spanId: value.id,
  depth: 0,
  kind: "internal",
  operationType: "function",
  error: false,
  details: {},
  correlations: [],
  events: [],
  offsetPercent: 0,
  widthPercent: 0,
  ...value,
});

const route = span({
  id: "route",
  name: "HTTP POST /orders",
  startedAt: at(0),
  durationMs: 12,
  events: [
    event("http.request.received", 0),
    event("http.route.matched", 1),
    event("http.response.completed", 12),
  ],
});
const handler = span({
  id: "fn",
  name: "orders.create",
  parentId: "route",
  startedAt: at(2),
  durationMs: 8,
});
const cache = span({
  id: "cache",
  name: "prices.getOrSet",
  parentId: "fn",
  startedAt: at(4),
  durationMs: 2,
  error: true,
});
const items = [route, handler, cache];

describe("trace view", () => {
  test("rows are depth-first with events and children interleaved by time", () => {
    const rows = traceRows(items);
    expect(rows.map((row) => row.id)).toEqual([
      "route",
      "route:event:0",
      "route:event:1",
      "fn",
      "cache",
      "route:event:2",
    ]);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 1, 1, 2, 1]);
    expect(rows.map((row) => row.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows.find((row) => row.id === "cache")?.offsetMs).toBe(4);
    expect(rows.find((row) => row.id === "route")?.expandable).toBe(true);
    expect(rows.find((row) => row.id === "cache")?.expandable).toBe(false);
  });

  test("collapsing a span hides its subtree but keeps numbering stable", () => {
    expect(traceRows(items, new Set(["fn"])).map((row) => row.id)).toEqual([
      "route",
      "route:event:0",
      "route:event:1",
      "fn",
      "route:event:2",
    ]);
    const rootOnly = traceRows(items, new Set(["route", "fn"]));
    expect(rootOnly.map((row) => row.id)).toEqual(["route"]);
    expect(traceStepTotal(items)).toBe(6);
  });

  test("an orphan whose parent is missing is shown as a root", () => {
    const rows = traceRows([
      span({ id: "lost", name: "orphan", parentId: "gone", startedAt: at(0) }),
    ]);
    expect(rows.map((row) => [row.id, row.depth])).toEqual([["lost", 0]]);
  });

  test("summary, clock and lifecycle describe the request", () => {
    const summary = traceSummary(items);
    expect(summary.root?.id).toBe("route");
    expect(summary).toMatchObject({ totalMs: 12, spans: 3, events: 3, errors: 1, running: false });
    expect(traceClock(items).totalMs).toBe(12);
    expect(
      lifecyclePhases(items).map((phase) => [phase.label, phase.offsetMs, phase.durationMs]),
    ).toEqual([
      ["request received", 0, undefined],
      ["route matched", 1, undefined],
      ["orders.create", 2, 8],
      ["response completed", 12, undefined],
    ]);
  });

  test("a handler recorded as a sibling of the transport span still joins the lifecycle", () => {
    const sibling = { ...handler, parentId: undefined };
    expect(lifecyclePhases([route, sibling]).map((phase) => phase.label)).toContain(
      "orders.create",
    );
  });

  test("bars and ruler stay inside the trace", () => {
    const clock = traceClock(items);
    const rows = traceRows(items);
    expect(
      barGeometry(
        rows.find((row) => row.id === "fn")!,
        clock,
      ),
    ).toEqual({
      left: (2 / 12) * 100,
      width: (8 / 12) * 100,
    });
    expect(
      barGeometry(
        rows.find((row) => row.id === "route:event:2")!,
        clock,
      ),
    ).toEqual({
      left: 100,
      width: 0,
    });
    expect(rulerTicks(12)).toEqual([0, 5, 10]);
    expect(rulerTicks(2.4)).toEqual([0, 1, 2]);
    expect(rulerTicks(0)).toEqual([0]);
    expect(shortEventName("http.request.received")).toBe("request received");
  });
});
