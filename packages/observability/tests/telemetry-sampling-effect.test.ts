import { expect, test } from "vitest";
import { Effect, Metric } from "effect";
import {
  isTelemetryError,
  isTelemetryErrorEffect,
  telemetryExportDecision,
  telemetryExportDecisionEffect,
  traceIsSampled,
  traceIsSampledEffect,
  type ObservabilityRecord,
} from "../src/index.ts";

const log: ObservabilityRecord = {
  version: 2,
  signal: "log",
  timestamp: "2026-09-02T00:00:00.000Z",
  level: "debug",
  component: "test",
  message: "local detail",
  fields: {},
};

test("sampling effects retain decision precedence and synchronous adapters", () => {
  expect(Effect.runSync(traceIsSampledEffect("trace", 0))).toBe(false);
  expect(Effect.runSync(traceIsSampledEffect("trace", 1))).toBe(true);
  expect(traceIsSampled("trace", 0.5)).toBe(Effect.runSync(traceIsSampledEffect("trace", 0.5)));
  expect(
    Effect.runSync(
      telemetryExportDecisionEffect(
        { ...log, traceId: "20000000000000000000000000000002" },
        { traceRate: 0, minimumLogLevel: "info" },
      ),
    ),
  ).toBe("sampled-out");
  expect(Effect.runSync(telemetryExportDecisionEffect(log, { minimumLogLevel: "info" }))).toBe(
    "severity-filtered",
  );
  expect(telemetryExportDecision(log, { minimumLogLevel: "trace" })).toBe("export");
  expect(Effect.runSync(isTelemetryErrorEffect({ ...log, level: "error" }))).toBe(true);
  expect(isTelemetryError(log)).toBe(false);
});

test("sampling rejects invalid inputs in its tagged Effect channel and compatibility adapters", () => {
  const invalidTrace = Effect.runSync(
    traceIsSampledEffect("").pipe(
      Effect.catchTag("TelemetrySamplingError", (error) => Effect.succeed(error)),
    ),
  );
  expect(invalidTrace).toMatchObject({ _tag: "TelemetrySamplingError", reason: "traceId" });
  const invalidRate = Effect.runSync(
    traceIsSampledEffect("trace", 2).pipe(
      Effect.catchTag("TelemetrySamplingError", (error) => Effect.succeed(error)),
    ),
  );
  expect(invalidRate).toMatchObject({ _tag: "TelemetrySamplingError", reason: "rate" });
  expect(() => traceIsSampled("")).toThrow(TypeError);
  expect(() => traceIsSampled("trace", 2)).toThrow(RangeError);
});

test("sampling records bounded success, failure, and duration metrics", () => {
  const registry = new Map();
  const metrics = Effect.runSync(
    Effect.gen(function* () {
      yield* traceIsSampledEffect("trace", 1);
      yield* traceIsSampledEffect("trace", 2).pipe(
        Effect.catchTag("TelemetrySamplingError", () => Effect.void),
      );
      const success = yield* Metric.value(
        Metric.counter("relkit_observability_sampling_operations_total", {
          attributes: { operation: "traceIsSampled", outcome: "success" },
        }),
      );
      const failure = yield* Metric.value(
        Metric.counter("relkit_observability_sampling_operations_total", {
          attributes: { operation: "traceIsSampled", outcome: "failure" },
        }),
      );
      const duration = yield* Metric.value(
        Metric.timer("relkit_observability_sampling_duration", {
          attributes: { operation: "traceIsSampled" },
        }),
      );
      return { success, failure, duration };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(metrics.success.count).toBe(1);
  expect(metrics.failure.count).toBe(1);
  expect(metrics.duration.count).toBe(2);
});

test("error classification covers each signal family", () => {
  const examples = [
    [{ ...log, errorId: "error-1" }, true],
    [{ signal: "request", outcome: "success" }, false],
    [{ signal: "request", outcome: "defect" }, true],
    [{ signal: "invocation", status: "started" }, false],
    [{ signal: "invocation", status: "failure" }, true],
    [{ signal: "job", state: "dead-lettered" }, true],
    [{ signal: "event", state: "failed" }, true],
    [{ signal: "operation", outcome: "success" }, false],
    [{ signal: "tool", outcome: "defect" }, true],
    [{ signal: "agent", outcome: "cancelled" }, true],
    [{ signal: "span", outcome: "error" }, true],
    [{ signal: "trace", outcome: "success" }, false],
    [{ signal: "generation", event: "failed" }, true],
    [{ signal: "diagnostic" }, false],
  ] as const;
  for (const [partial, expected] of examples) {
    const record = { ...log, ...partial } as unknown as ObservabilityRecord;
    expect(Effect.runSync(isTelemetryErrorEffect(record))).toBe(expected);
  }
});
