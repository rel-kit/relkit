import { describe, expect, test } from "bun:test";
import {
  mergeLiveItems,
  queryFromFilters,
  traceGroups,
  waterfall,
  EMPTY_SIGNAL_FILTERS,
} from "./observability-model";
import { defaultSignalFilters } from "./signal-defaults";
import { attachLogs, attachSources } from "../app/signal-detail-live";
import {
  stepDescription,
  stepInput,
  stepOutcome,
  stepOutput,
  traceTimeline,
} from "./trace-timeline";

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

  test("attaches correlated logs and generation-safe descriptor sources to spans", () => {
    const spans = attachSources(
      attachLogs(
        [{ signal: "span", traceId: "trace-1", spanId: "span-1", functionId: "orders.read" }],
        [{ signal: "log", spanId: "span-1", message: "done" }],
      ),
      {
        protocol: "relkit.inspector",
        version: 1,
        generationId: "generation-1",
        graphHash: "sha256:one",
        nodes: [
          {
            id: "orders.read",
            source: { file: "src/orders/read.function.ts", line: 4, column: 1 },
          },
        ],
      },
      { generationId: "generation-1", graphHash: "sha256:one" },
    );
    const detail = waterfall(spans)[0]?.details;
    expect(detail?.logs).toEqual([expect.objectContaining({ message: "done" })]);
    expect(detail?.source).toEqual({
      file: "src/orders/read.function.ts",
      line: 4,
      column: 1,
    });
    expect(
      attachSources(
        spans,
        {
          protocol: "relkit.inspector",
          version: 1,
          generationId: "generation-2",
          graphHash: "sha256:two",
          nodes: [],
        },
        { generationId: "generation-1", graphHash: "sha256:one" },
      ),
    ).toBe(spans);
  });

  test("merges span updates and renders canonical parent-aware spans", () => {
    const at = (ms: number) => new Date(Date.UTC(2026, 8, 3, 0, 0, 0, ms)).toISOString();
    const root = {
      signal: "span",
      spanId: "root",
      invocationId: "invoke-1",
      traceId: "trace-1",
      name: "orders.create",
      startedAt: at(10),
      status: "started",
    };
    const complete = { ...root, status: "completed", completedAt: at(40) };
    const sibling = {
      ...root,
      spanId: "sibling",
      parentSpanId: "root",
      startedAt: at(12),
      completedAt: at(30),
    };
    const child = {
      ...root,
      spanId: "child",
      parentSpanId: "root",
      startedAt: at(11),
      completedAt: at(35),
    };
    const nested = {
      ...root,
      spanId: "nested",
      parentSpanId: "child",
      startedAt: at(15),
      completedAt: at(20),
    };
    const request = {
      signal: "request",
      requestId: "r1",
      invocationId: "invoke-1",
      traceId: "trace-1",
      method: "POST",
      rawPath: "/orders",
      startedAt: at(0),
      completedAt: at(50),
      timeline: [
        { kind: "accepted", at: at(0) },
        { kind: "mapping", at: at(9), durationMs: 5 },
        { kind: "function", at: at(45), durationMs: 35 },
        { kind: "response", at: at(50), status: 201 },
      ],
    };
    const nodes = waterfall([complete, root, sibling, nested, child], [request]);
    expect(nodes.filter((node) => node.recordType === "span").map((node) => node.spanId)).toEqual([
      "root",
      "child",
      "nested",
      "sibling",
    ]);
    expect(nodes.find((node) => node.spanId === "root")).toMatchObject({
      durationMs: 30,
      depth: 0,
    });
    expect(nodes.find((node) => node.spanId === "child")).toMatchObject({ depth: 1 });
    expect(nodes.find((node) => node.spanId === "nested")).toMatchObject({ depth: 2 });
    expect(traceGroups([root, complete, request])[0]).toMatchObject({
      name: "POST /orders",
      durationMs: 50,
      spans: [expect.objectContaining({ spanId: "root", completedAt: at(40) })],
    });
    expect(waterfall([{ ...root, parentSpanId: "child" }, child])).toHaveLength(2);
    expect(
      mergeLiveItems([{ signal: "log", cursor: "1", requestId: "r1" }], {
        data: { signal: "log", cursor: "2", requestId: "r1" },
      }),
    ).toHaveLength(2);
    expect(mergeLiveItems([root], { data: { ...child, requestId: "r1" } })).toHaveLength(2);
  });

  test("numbers spans and lifecycle events by recorded time with safe input and results", () => {
    const items = waterfall(
      [
        {
          signal: "span",
          traceId: "trace-1",
          spanId: "root",
          name: "HTTP POST /orders",
          startedAt: "2026-09-03T00:00:00.000Z",
          completedAt: "2026-09-03T00:00:00.010Z",
          outcome: "success",
          attributes: {
            "http.request.method": "POST",
            "http.response.status_code": 201,
            "relkit.request.id": "request-1",
          },
          events: [
            { name: "http.request.received", timestamp: "2026-09-03T00:00:00.001Z" },
            {
              name: "http.response.headers",
              timestamp: "2026-09-03T00:00:00.009Z",
              attributes: { "http.response.status_code": 201 },
            },
            { name: "http.success", timestamp: "2026-09-03T00:00:00.010Z" },
          ],
        },
        {
          signal: "span",
          traceId: "trace-1",
          spanId: "child",
          parentSpanId: "root",
          name: "relkit.invoke.orders.create",
          inputCapture: {
            mode: "development-redacted",
            bytes: 18,
            truncated: false,
            content: { orderId: "order-1" },
          },
          outputCapture: {
            mode: "development-redacted",
            bytes: 11,
            truncated: false,
            content: { ok: true },
          },
          startedAt: "2026-09-03T00:00:00.002Z",
          completedAt: "2026-09-03T00:00:00.008Z",
          outcome: "success",
        },
      ],
      [
        {
          signal: "request",
          phase: "completed",
          requestId: "request-1",
          traceId: "trace-1",
          method: "POST",
          normalizedRoute: "/orders",
          requestBytes: 42,
          status: 201,
          responseBytes: 12,
          outcome: "success",
        },
      ],
    );
    const steps = traceTimeline(items);
    expect(steps.map((step) => step.name)).toEqual([
      "HTTP POST /orders",
      "http.request.received",
      "relkit.invoke.orders.create",
      "http.response.headers",
      "http.success",
    ]);
    expect(stepInput(steps[0]!)).toMatchObject({
      method: "POST",
      route: "/orders",
      bytes: 42,
    });
    expect(stepOutput(steps[0]!)).toMatchObject({
      statusCode: 201,
      bytes: 12,
    });
    expect(stepInput(steps[0]!)).not.toHaveProperty("id");
    expect(steps[0]?.span.details.metadata).toMatchObject({
      "relkit.request.id": "request-1",
    });
    expect(stepOutcome(steps[0]!)).toMatchObject({ outcome: "success" });
    expect(stepDescription(steps[1]!)).toBe("HTTP POST /orders");
    expect(steps[2]?.span.operationType).toBe("function");
    expect(stepInput(steps[2]!)).toEqual({ orderId: "order-1" });
    expect(stepOutput(steps[2]!)).toEqual({ ok: true });
    expect(stepInput(steps[3]!)).toMatchObject({
      "http.response.status_code": 201,
    });
    expect(stepOutput(steps[4]!)).toEqual({ statusCode: 201, bytes: 12 });
  });
});
