import { describe, expect, test } from "bun:test";
import { EMPTY_SIGNAL_FILTERS } from "./observability-model";
import {
  REQUEST_OUTCOME_OPTIONS,
  countLabel,
  filterProblems,
  hasActiveFilters,
  matchesRequestFilters,
  statusRange,
} from "./request-filters";

describe("request filter validation", () => {
  test("accepts an exact status, a class, a method, a path and an error id", () => {
    expect(
      filterProblems({
        ...EMPTY_SIGNAL_FILTERS,
        status: "5xx",
        method: "get",
        path: "/orders",
        errorId: "fleet.plate-taken",
      }),
    ).toEqual([]);
    expect(filterProblems({ ...EMPTY_SIGNAL_FILTERS, status: "404" })).toEqual([]);
  });

  test("names the field and says what a valid value looks like", () => {
    const problems = filterProblems({
      ...EMPTY_SIGNAL_FILTERS,
      status: "700",
      method: "G E T",
      path: "orders",
      errorId: "x".repeat(257),
    });
    expect(problems.map((problem) => problem.field)).toEqual([
      "status",
      "method",
      "path",
      "errorId",
    ]);
    expect(problems[0]?.message).toBe(
      "Status must be a code from 100 to 599, or a class such as 5xx.",
    );
    expect(problems[2]?.message).toBe("Path must start with /, for example /orders.");
  });

  test("reads a status class as an inclusive range", () => {
    expect(statusRange("4xx")).toEqual([400, 499]);
    expect(statusRange("404")).toEqual([404, 404]);
    expect(statusRange("600")).toBeUndefined();
    expect(statusRange("abc")).toBeUndefined();
  });

  test("offers every request outcome with a plain label", () => {
    expect(REQUEST_OUTCOME_OPTIONS.map((option) => option.value)).toEqual([
      "success",
      "declared-error",
      "validation-error",
      "timeout",
      "cancelled",
      "defect",
    ]);
    expect(REQUEST_OUTCOME_OPTIONS.every((option) => option.label !== option.value)).toBe(true);
  });
});

describe("request counts", () => {
  test("says how many requests exist, or how many match the filters", () => {
    expect(countLabel(1144, false)).toBe("1,144 requests");
    expect(countLabel(1, false)).toBe("1 request");
    expect(countLabel(29, true)).toBe("29 requests match");
    expect(countLabel(1, true)).toBe("1 request matches");
    expect(countLabel(0, true)).toBe("No requests match");
    expect(countLabel(0, false)).toBe("No requests");
  });

  test("a time range or a page size alone is a filter only when the range is set", () => {
    expect(hasActiveFilters(EMPTY_SIGNAL_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_SIGNAL_FILTERS, status: "5xx" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_SIGNAL_FILTERS, from: "2026-08-16T09:30" })).toBe(true);
  });
});

describe("live record matching", () => {
  const request = {
    signal: "request",
    requestId: "request-1",
    method: "POST",
    rawPath: "/orders/123",
    status: 409,
    errorId: "fleet.plate-taken",
  };

  test("applies status, method, path and error id like the history API", () => {
    expect(matchesRequestFilters(request, { status: "4xx" })).toBe(true);
    expect(matchesRequestFilters(request, { status: "409" })).toBe(true);
    expect(matchesRequestFilters(request, { status: "5xx" })).toBe(false);
    expect(matchesRequestFilters(request, { method: "post" })).toBe(true);
    expect(matchesRequestFilters(request, { method: "GET" })).toBe(false);
    expect(matchesRequestFilters(request, { path: "/orders" })).toBe(true);
    expect(matchesRequestFilters(request, { path: "/trips" })).toBe(false);
    expect(matchesRequestFilters(request, { errorId: "fleet.plate-taken" })).toBe(true);
    expect(matchesRequestFilters(request, { errorId: "other" })).toBe(false);
  });

  test("searches every recorded field without case", () => {
    expect(matchesRequestFilters(request, { search: "PLATE-taken" })).toBe(true);
    expect(matchesRequestFilters(request, { search: "nothing here" })).toBe(false);
  });

  test("a started request has no status yet, so a status filter excludes it", () => {
    const started = { signal: "request", phase: "started", method: "GET", rawPath: "/a" };
    expect(matchesRequestFilters(started, { status: "2xx" })).toBe(false);
    expect(matchesRequestFilters(started, {})).toBe(true);
  });
});
