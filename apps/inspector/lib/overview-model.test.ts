import { describe, expect, test } from "bun:test";
import {
  formatRate,
  isFailedRequest,
  requestSummary,
  requestVolume,
  storageHealth,
} from "./overview-model";

describe("requestSummary", () => {
  test("links completed requests and prefers the normalized route", () => {
    const summary = requestSummary({
      requestId: "request-1",
      method: "POST",
      normalizedRoute: "/trips/:id",
      rawPath: "/trips/42",
      status: 201,
      outcome: "success",
      durationMs: 12,
      completedAt: "2026-10-31T20:41:14.383Z",
    });
    expect(summary).toMatchObject({
      id: "request-1",
      method: "POST",
      path: "/trips/:id",
      status: 201,
      tone: "success",
      statusLabel: "HTTP 201 success",
      durationMs: 12,
      href: "/requests/request-1",
    });
  });

  test("falls back to the raw path for unmatched routes and tones by status", () => {
    expect(
      requestSummary({ requestId: "a", normalizedRoute: "unknown", rawPath: "/x", status: 404 }),
    ).toMatchObject({ path: "/x", tone: "warning" });
    expect(requestSummary({ requestId: "b", status: 503 }).tone).toBe("danger");
    expect(requestSummary({ requestId: "c", phase: "started" }).tone).toBe("live");
  });

  test("omits the link when the request id is missing", () => {
    expect(requestSummary({ method: "GET" }).href).toBeUndefined();
  });
});

describe("isFailedRequest", () => {
  test("treats 5xx and status-less failing outcomes as failures, not 4xx", () => {
    expect(isFailedRequest({ status: 500, outcome: "defect" })).toBe(true);
    expect(isFailedRequest({ outcome: "error" })).toBe(true);
    expect(isFailedRequest({ status: 422, outcome: "validation-error" })).toBe(false);
    expect(isFailedRequest({ status: 404, outcome: "success" })).toBe(false);
  });
});

describe("requestVolume", () => {
  test("buckets per minute ending at the newest request", () => {
    const volume = requestVolume(
      [
        { completedAt: "2026-10-31T20:41:50.000Z", status: 200 },
        { completedAt: "2026-10-31T20:41:10.000Z", status: 500 },
        { completedAt: "2026-10-31T20:39:30.000Z", status: 200 },
      ],
      4,
    );
    expect(volume.total).toBe(3);
    expect(volume.failed).toBe(1);
    expect(volume.errorRate).toBeCloseTo(1 / 3);
    expect(volume.perMinute).toEqual([0, 1, 0, 2]);
    expect(volume.since).toBe("2026-10-31T20:39:30.000Z");
  });

  test("reports an empty sample without a rate or trend", () => {
    expect(requestVolume([])).toEqual({ total: 0, failed: 0, perMinute: [] });
  });
});

describe("formatRate", () => {
  test("formats shares as percentages", () => {
    expect(formatRate(undefined)).toBe("—");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(0.004)).toBe("0.4%");
    expect(formatRate(0.125)).toBe("13%");
  });
});

describe("storageHealth", () => {
  test("maps storage states onto badge words", () => {
    expect(storageHealth(undefined)).toEqual({ tone: "live", label: "checking" });
    expect(storageHealth({ state: "unavailable" }).tone).toBe("neutral");
    expect(storageHealth({ error: "history.writer-conflict" }).tone).toBe("danger");
    expect(storageHealth({ state: "degraded" }).label).toBe("degraded");
    expect(storageHealth({ state: "ready", incomplete: true }).tone).toBe("warning");
    expect(storageHealth({ state: "ready", connection: "connected" })).toEqual({
      tone: "success",
      label: "ready",
    });
  });

  test("history stays ready while the application is away (IN-09)", () => {
    expect(storageHealth({ state: "ready", connection: "disconnected" })).toEqual({
      tone: "success",
      label: "ready",
    });
    expect(storageHealth({ state: "ready", connection: "ambiguous" }).label).toBe("ready");
  });
});
