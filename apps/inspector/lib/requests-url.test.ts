import { describe, expect, test } from "bun:test";
import { EMPTY_SIGNAL_FILTERS } from "./observability-model";
import { newerCursor, parseRequestsLocation, requestsSearch, trailAfter } from "./requests-url";

describe("requests page URL state", () => {
  test("the default view has an empty query string", () => {
    expect(requestsSearch({ filters: EMPTY_SIGNAL_FILTERS, limit: 50 })).toBe("");
    expect(parseRequestsLocation(new URLSearchParams(""))).toEqual({
      filters: EMPTY_SIGNAL_FILTERS,
      limit: 50,
    });
  });

  test("keeps every filter, the page size and the cursor, and reads them back", () => {
    const state = {
      filters: {
        ...EMPTY_SIGNAL_FILTERS,
        status: "5xx",
        method: "POST",
        path: "/orders",
        search: "plate taken",
        outcome: "defect",
        errorId: "fleet.plate-taken",
        routeId: "route.orders",
        functionId: "orders.create",
        requestId: "request-1",
        traceId: "0".repeat(32),
        serviceId: "api",
      },
      limit: 25,
      cursor: "300",
    };
    const search = requestsSearch(state);
    const params = new URLSearchParams(search);
    expect(params.get("status")).toBe("5xx");
    expect(params.get("search")).toBe("plate taken");
    expect(params.get("errorId")).toBe("fleet.plate-taken");
    expect(params.get("limit")).toBe("25");
    expect(params.get("cursor")).toBe("300");
    expect(parseRequestsLocation(params)).toEqual(state);
  });

  test("stores a time range as UTC instants and reads it back as local input values", () => {
    const state = {
      filters: { ...EMPTY_SIGNAL_FILTERS, from: "2026-08-16T09:30", to: "2026-08-17T18:00" },
      limit: 50,
    };
    const params = new URLSearchParams(requestsSearch(state));
    expect(params.get("from")).toBe(new Date("2026-08-16T09:30").toISOString());
    expect(params.get("to")).toBe(new Date("2026-08-17T18:00").toISOString());
    expect(parseRequestsLocation(params)).toEqual(state);
  });

  test("ignores an unknown outcome, a bad page size and a bad time", () => {
    const parsed = parseRequestsLocation(
      new URLSearchParams("outcome=exploded&limit=7&from=yesterday&cursor="),
    );
    expect(parsed.filters.outcome).toBe("");
    expect(parsed.filters.from).toBe("");
    expect(parsed.limit).toBe(50);
    expect(parsed.cursor).toBeUndefined();
  });
});

describe("page trail", () => {
  test("remembers the pages visited so Newer returns to the page you came from", () => {
    let trail = trailAfter(undefined, "f", undefined);
    expect(trail.cursors).toEqual([undefined]);
    trail = trailAfter(trail, "f", "50");
    trail = trailAfter(trail, "f", "100");
    expect(trail.cursors).toEqual([undefined, "50", "100"]);
    expect(newerCursor(trail)).toBe("50");
    trail = trailAfter(trail, "f", "50");
    expect(trail.cursors).toEqual([undefined, "50"]);
    expect(newerCursor(trail)).toBeUndefined();
  });

  test("starts over when the filters change and treats a shared deep link as one page deep", () => {
    const trail = trailAfter(trailAfter(undefined, "f", undefined), "f", "50");
    const other = trailAfter(trail, "g", "900");
    expect(other.cursors).toEqual([undefined, "900"]);
    expect(newerCursor(other)).toBeUndefined();
  });
});
