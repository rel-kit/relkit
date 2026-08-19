import { expect, test } from "bun:test";
import {
  appendObservedRequestDetails,
  createRequestRecordBuilder,
  REQUEST_OUTCOMES,
  type ObservabilityRecord,
} from "./src/index.ts";

test("appends correlated child and dependency records in timeline order", () => {
  const requestId = "request.test";
  const traceId = "trace.test";
  const at = "2026-08-16T00:00:00.000Z";
  const completed = "2026-08-16T00:00:00.001Z";
  const records: ObservabilityRecord[] = [
    {
      version: 1,
      signal: "invocation",
      id: "invocation.root",
      functionId: "hello",
      traceId,
      correlationId: requestId,
      startedAt: at,
      attempt: 1,
      source: "http",
      status: "success",
      completedAt: completed,
      durationMs: 1,
    },
    {
      version: 1,
      signal: "invocation",
      id: "invocation.child",
      functionId: "child",
      traceId,
      correlationId: requestId,
      parentId: "invocation.root",
      startedAt: at,
      attempt: 1,
      source: "direct",
      status: "success",
      completedAt: completed,
      durationMs: 1,
    },
    {
      version: 1,
      signal: "resource",
      kind: "bucket",
      resourceId: "uploads",
      operation: "get",
      ownerId: "hello",
      outcome: "success",
      traceId,
      correlationId: requestId,
      startedAt: at,
      completedAt: completed,
      durationMs: 1,
    },
    {
      version: 1,
      signal: "job",
      jobId: "email.send",
      instanceId: "job-1",
      functionId: "sendEmail",
      profile: "default",
      state: "completed",
      attempt: 1,
      acceptedAt: at,
      startedAt: at,
      completedAt: completed,
      durationMs: 1,
      traceId,
      correlationId: requestId,
    },
    {
      version: 1,
      signal: "event",
      kind: "publication",
      eventId: "order.created",
      eventVersion: 1,
      instanceId: "event-1",
      state: "published",
      occurredAt: at,
      traceId,
      correlationId: requestId,
    },
    {
      version: 1,
      signal: "tool",
      toolId: "search",
      functionId: "search",
      sideEffect: "none",
      approval: "not-required",
      outcome: "success",
      startedAt: at,
      completedAt: completed,
      durationMs: 1,
      traceId,
      correlationId: requestId,
    },
  ];
  const builder = createRequestRecordBuilder({
    requestId,
    traceId,
    generationId: "generation.test",
    graphHash: "sha256:test",
    method: "GET",
    rawPath: "/hello",
    startedAt: Date.parse(at),
    now: () => Date.parse(completed),
  });
  builder.add({ kind: "accepted", at });
  appendObservedRequestDetails(builder, records, requestId, traceId);
  const record = builder.finish({ status: 200, completedAt: Date.parse(completed) });

  expect(record.invocationId).toBe("invocation.root");
  expect(record.timeline.map(({ kind }) => kind)).toEqual([
    "accepted",
    "event",
    "child",
    "resource",
    "job",
    "tool",
  ]);
});

test("records every request outcome and preserves declared error identity", () => {
  const cases = [
    ["success", 200],
    ["declared-error", 409],
    ["validation-error", 422],
    ["timeout", 504],
    ["cancelled", 499],
    ["defect", 500],
  ] as const;
  const records = cases.map(([outcome, status], index) => {
    const builder = createRequestRecordBuilder({
      requestId: `request.${index}`,
      traceId: `trace.${index}`,
      generationId: "generation.test",
      graphHash: "sha256:test",
      method: "GET",
      rawPath: "/orders",
      startedAt: 0,
      now: () => 1,
    });
    builder.setOutcome(outcome, outcome === "declared-error" ? "orders.conflict" : undefined);
    return builder.finish({ status, completedAt: 1 });
  });

  expect(records.map(({ outcome }) => outcome)).toEqual([...REQUEST_OUTCOMES]);
  expect(records[1]).toMatchObject({ outcome: "declared-error", errorId: "orders.conflict" });
  expect(records.map(({ status }) => status)).toEqual(cases.map(([, status]) => status));
});

test("preserves cross-signal parent and child trace correlation", () => {
  const records: ObservabilityRecord[] = [
    {
      version: 1,
      signal: "span",
      spanId: "span.root",
      invocationId: "invocation.root",
      traceId: "trace.parent-child",
      requestId: "request.parent-child",
      name: "http.orders",
      status: "completed",
      startedAt: "2026-08-16T00:00:00.000Z",
      completedAt: "2026-08-16T00:00:00.001Z",
    },
    {
      version: 1,
      signal: "span",
      spanId: "span.child",
      invocationId: "invocation.child",
      traceId: "trace.parent-child",
      correlationId: "request.parent-child",
      parentSpanId: "span.root",
      name: "cache.orders.get",
      status: "completed",
      startedAt: "2026-08-16T00:00:00.000Z",
      completedAt: "2026-08-16T00:00:00.001Z",
      outcome: "success",
    },
  ];
  const spans = records.filter((record) => record.signal === "span");

  expect(spans[0]).toMatchObject({ traceId: "trace.parent-child", spanId: "span.root" });
  expect(spans[1]).toMatchObject({
    traceId: "trace.parent-child",
    correlationId: "request.parent-child",
    parentSpanId: "span.root",
  });
});
