import { expect, test } from "vitest";
import { toObservabilityRecord } from "../src/collector-events.js";
test("runtime invocation events retain correlation and safe defaults", () => {
  const record = toObservabilityRecord({
    type: "invocation.completed",
    completion: {
      record: {
        id: "invocation-1",
        functionId: "function-1",
        traceId: "trace-1",
        startedAt: "2026-09-25T00:00:00.000Z",
        completedAt: "2026-09-25T00:00:01.000Z",
        requestId: "request-1",
        attempt: 2,
        status: "success",
        durationMs: 1000,
      },
    },
  });
  expect(record).toMatchObject({
    signal: "invocation",
    id: "invocation-1",
    requestId: "request-1",
    attempt: 2,
    source: "direct",
    status: "success",
    durationMs: 1000,
  });
  expect(
    toObservabilityRecord({ type: "invocation.started", record: { id: "only-id" } }),
  ).toBeUndefined();
});
test("span lifecycle events normalize optional values and reject missing identity", () => {
  const record = toObservabilityRecord({
    type: "span.completed",
    record: {
      spanId: "span-1",
      traceId: "trace-1",
      invocationId: "invocation-1",
      name: "database.query",
      startedAt: "2026-09-25T00:00:00.000Z",
      completedAt: "2026-09-25T00:00:01.000Z",
      kind: "client",
      status: "completed",
      outcome: "success",
      revision: 2,
    },
  });
  expect(record).toMatchObject({
    signal: "span",
    spanId: "span-1",
    invocationId: "invocation-1",
    kind: "client",
    status: "completed",
    outcome: "success",
    revision: 2,
  });
  expect(
    toObservabilityRecord({ type: "span.started", record: { name: "missing-id" } }),
  ).toBeUndefined();
});
test("request failures become correlated logs without exposing unrelated fields", () => {
  const record = toObservabilityRecord({
    type: "request.failed",
    requestId: "request-1",
    traceId: "trace-1",
    completedAt: "2026-09-25T00:00:01.000Z",
    method: "POST",
    path: "/orders",
    status: 500,
    errorName: "InternalError",
    secret: "must-not-copy",
  });
  expect(record).toMatchObject({
    signal: "log",
    level: "error",
    component: "runtime.http",
    requestId: "request-1",
    fields: { method: "POST", path: "/orders", status: 500, errorName: "InternalError" },
  });
  expect(JSON.stringify(record)).not.toContain("must-not-copy");
  expect(toObservabilityRecord({ type: "request.failed", traceId: "trace-1" })).toBeUndefined();
});
test("unrecognized and invalid runtime events are ignored", () => {
  expect(toObservabilityRecord(null)).toBeUndefined();
  expect(toObservabilityRecord([])).toBeUndefined();
  expect(toObservabilityRecord({ type: "unrecognized" })).toBeUndefined();
  expect(
    toObservabilityRecord({
      timestamp: "2026-09-25T00:00:00.000Z",
      component: "runtime",
      message: "hello",
      level: "invalid",
    }),
  ).toBeUndefined();
});
