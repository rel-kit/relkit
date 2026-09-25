import { expect, test } from "vitest";
import { Effect, Exit, Metric } from "effect";
import { toObservabilityRecordEffect } from "../src/collector-events-effect.js";
import {
  invocationRecordEffect,
  logRecordEffect,
  spanRecordEffect,
} from "../src/collector-records-effect.js";
import { invocationRecord, logRecord, spanRecord } from "../src/collector-records.js";
import {
  collectorTextEffect,
  isCollectorRecordEffect,
  isInvocationEffect,
  isModelRecordEffect,
  isRuntimeLogEffect,
} from "../src/collector-values-effect.js";
import {
  isInvocation,
  isModelRecord,
  isRecord,
  isRuntimeLog,
  text,
} from "../src/collector-values.js";
test("Effect collector converters cover every record and guard path", async () => {
  const invocation = {
    id: "invocation-1",
    functionId: "function-1",
    traceId: "trace-1",
    startedAt: "2026-09-25T00:00:00.000Z",
    source: "direct",
  };
  const log = {
    timestamp: "2026-09-25T00:00:00.000Z",
    component: "runtime",
    message: "ready",
    level: "info",
  };
  const span = {
    spanId: "span-1",
    traceId: "trace-1",
    name: "query",
    startedAt: "2026-09-25T00:00:00.000Z",
  };
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const invocationValue = yield* invocationRecordEffect(invocation);
      const logValue = yield* logRecordEffect(log);
      const spanValue = yield* spanRecordEffect(span);
      const event = yield* toObservabilityRecordEffect({
        type: "invocation.started",
        record: invocation,
      });
      const checks = [
        yield* isCollectorRecordEffect(invocation),
        yield* isInvocationEffect(invocation),
        yield* isRuntimeLogEffect(log),
        yield* isModelRecordEffect({ version: 2, signal: "log" }),
      ];
      const name = yield* collectorTextEffect("ready");
      return { invocationValue, logValue, spanValue, event, checks, name };
    }),
  );
  expect(result.invocationValue?.signal).toBe("invocation");
  expect(result.logValue?.signal).toBe("log");
  expect(result.spanValue?.signal).toBe("span");
  expect(result.event).toEqual(result.invocationValue);
  expect(result.checks).toEqual([true, true, true, true]);
  expect(result.name).toBe("ready");
  expect(invocationRecord(invocation)).toEqual(result.invocationValue);
  expect(logRecord(log)).toEqual(result.logValue);
  expect(spanRecord(span)).toEqual(result.spanValue);
  expect(isRecord(invocation)).toBe(true);
  expect(isInvocation(invocation)).toBe(true);
  expect(isRuntimeLog(log)).toBe(true);
  expect(isModelRecord({ version: 2, signal: "log" })).toBe(true);
  expect(text("ready")).toBe("ready");
});
test("Effect event conversion records success and defect metrics", async () => {
  const registry = new Map();
  const malicious = Object.defineProperty({}, "type", {
    get() {
      throw new Error("invalid getter");
    },
  });
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      yield* toObservabilityRecordEffect({ type: "unknown" });
      const failureExit = yield* Effect.exit(toObservabilityRecordEffect(malicious));
      const success = yield* Metric.value(
        Metric.counter("relkit_observability_collector_events_total", {
          attributes: { operation: "toRecord", outcome: "success" },
        }),
      );
      const failure = yield* Metric.value(
        Metric.counter("relkit_observability_collector_events_total", {
          attributes: { operation: "toRecord", outcome: "failure" },
        }),
      );
      return { failureExit, success, failure };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(Exit.isFailure(result.failureExit)).toBe(true);
  expect(result.success.count).toBe(1);
  expect(result.failure.count).toBe(1);
});
