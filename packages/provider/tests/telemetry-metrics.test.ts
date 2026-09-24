import { expect, test } from "vitest";
import { Effect, Metric, Tracer } from "effect";
import {
  ProviderTelemetryLive,
  defineProviderCapability,
  defineProviderCapabilityEffect,
} from "../src/index.js";

test("live telemetry records bounded success and failure metrics and spans", () => {
  const operation = "capability.define";
  const calls = Metric.withAttributes(
    Metric.counter("relkit_provider_operations_total", {
      incremental: true,
    }),
    { operation },
  );
  const failures = Metric.withAttributes(
    Metric.counter("relkit_provider_failures_total", {
      incremental: true,
    }),
    { operation },
  );
  const duration = Metric.withAttributes(
    Metric.histogram("relkit_provider_duration_ms", {
      boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
    }),
    { operation },
  );
  const before = Effect.runSync(
    Effect.gen(function* () {
      return {
        calls: (yield* Metric.value(calls)).count,
        failures: (yield* Metric.value(failures)).count,
        duration: (yield* Metric.value(duration)).count,
      };
    }),
  );
  const spans: string[] = [];
  const tracer = Tracer.make({
    span(options) {
      spans.push(options.name);
      return Tracer.nativeTracer.span(options);
    },
  });
  Effect.runSync(
    Effect.withTracer(
      Effect.provide(defineProviderCapabilityEffect("cache"), ProviderTelemetryLive),
      tracer,
    ),
  );
  Effect.runSync(
    Effect.withTracer(
      Effect.provide(
        Effect.catchTag(
          defineProviderCapabilityEffect(""),
          "ProviderValidationError",
          () => Effect.void,
        ),
        ProviderTelemetryLive,
      ),
      tracer,
    ),
  );
  const after = Effect.runSync(
    Effect.gen(function* () {
      return {
        calls: (yield* Metric.value(calls)).count,
        failures: (yield* Metric.value(failures)).count,
        duration: (yield* Metric.value(duration)).count,
      };
    }),
  );
  expect(after.calls - before.calls).toBe(2);
  expect(after.failures - before.failures).toBe(1);
  expect(after.duration - before.duration).toBe(2);
  expect(spans).toEqual(["provider.capability.define", "provider.capability.define"]);
  const beforeAdapter = Effect.runSync(Metric.value(calls)).count;
  defineProviderCapability("bucket");
  expect(Effect.runSync(Metric.value(calls)).count - beforeAdapter).toBe(1);
});
