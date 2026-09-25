import { expect, test } from "vitest";
import { Effect, Metric } from "effect";
import {
  assembleRequestExecutionEffect,
  coalesceSpansEffect,
  currentTraceEffect,
} from "../src/execution-assembly-effect.js";
import {
  assembleRequestExecution,
  coalesceSpans,
  MAX_EXECUTION_RECORDS,
} from "../src/execution-assembly.ts";
import type { ObservabilityRecord, SpanRecord } from "../src/model.ts";
const traceId = "10000000000000000000000000000001";
test("coalesces span revisions and reports malformed execution trees", () => {
  const start = span("1000000000000001", "1000000000000002", "started", 0);
  const completed = {
    ...start,
    status: "completed" as const,
    revision: 2,
    completedAt: "2026-09-03T00:00:00.010Z",
    outcome: "success" as const,
  };
  const cycle = span("1000000000000002", "1000000000000001", "updated", 1);
  const records: ObservabilityRecord[] = [request(), start, completed, cycle];
  const detail = assembleRequestExecution(records, "request-1");
  expect(coalesceSpans([start, completed])).toEqual([completed]);
  expect(detail?.spans).toHaveLength(2);
  expect(detail?.roots).not.toHaveLength(0);
  expect(detail?.incomplete).toContain("cycle");
  expect(detail?.incomplete).toContain("request-active");
});
test("keeps authoritative lifecycle completions when execution detail is bounded", () => {
  const started = span("1000000000000001", "1000000000000002", "started", 0);
  const completed = {
    ...started,
    status: "completed" as const,
    revision: 1,
    completedAt: "2026-09-03T00:00:00.010Z",
    outcome: "success" as const,
  };
  const requestCompleted = {
    ...request(),
    phase: "completed" as const,
    completedAt: "2026-09-03T00:00:00.010Z",
    durationMs: 10,
    status: 200,
    outcome: "success" as const,
  };
  const filler: ObservabilityRecord[] = Array.from(
    { length: MAX_EXECUTION_RECORDS },
    (_, index) => ({
      version: 2,
      signal: "log",
      timestamp: new Date(Date.UTC(2026, 8, 3, 0, 0, 0, index)).toISOString(),
      level: "debug",
      component: "test",
      message: String(index),
      fields: {},
    }),
  );
  const detail = assembleRequestExecution(
    [request(), started, ...filler, requestCompleted, completed],
    "request-1",
  );
  expect(detail?.request.phase).toBe("completed");
  expect(detail?.spans).toEqual([completed]);
  expect(detail?.records).toHaveLength(MAX_EXECUTION_RECORDS);
  expect(detail?.incomplete).toContain("record-limit");
});
test("Effect assembly agrees with adapters and records bounded operation metrics", async () => {
  const currentSpan = span("1000000000000001", "1000000000000002", "started", 0);
  const records = [request(), currentSpan];
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const detail = yield* assembleRequestExecutionEffect(records, "request-1");
      const spans = yield* coalesceSpansEffect([currentSpan]);
      const trace = yield* currentTraceEffect(spans);
      const metric = yield* Metric.value(
        Metric.counter("relkit_observability_execution_assembly_total", {
          attributes: { operation: "assemble", outcome: "success" },
        }),
      );
      return { detail, spans, trace, metric };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.detail).toEqual(assembleRequestExecution(records, "request-1"));
  expect(result.spans).toHaveLength(1);
  expect(result.trace.spans).toEqual(result.spans);
  expect(result.metric.count).toBe(1);
});
function span(
  spanId: string,
  parentSpanId: string,
  status: SpanRecord["status"],
  revision: number,
): SpanRecord {
  return {
    version: 2,
    signal: "span",
    traceId,
    spanId,
    parentSpanId,
    name: spanId,
    kind: "internal",
    status,
    revision,
    startedAt: "2026-09-03T00:00:00.000Z",
  };
}
function request(): ObservabilityRecord {
  return {
    version: 2,
    signal: "request",
    phase: "started",
    requestId: "request-1",
    originRequestId: "request-1",
    traceId,
    generationId: "generation-1",
    graphHash: "sha256:test",
    startedAt: "2026-09-03T00:00:00.000Z",
    method: "GET",
    rawPath: "/orders",
  };
}
