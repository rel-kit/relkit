import { expect, test } from "vitest";
import { Effect, Metric } from "effect";
import {
  defineTelemetryExporter,
  isTelemetryExporterDescriptor,
  normalizeTelemetryConfiguration,
} from "../src/telemetry-config.js";
import {
  defineTelemetryExporterEffect,
  isTelemetryExporterDescriptorEffect,
  normalizeTelemetryConfigurationEffect,
} from "../src/telemetry-config-effect.js";
test("Effect telemetry configuration preserves typed descriptors and adapters", async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const descriptor = yield* defineTelemetryExporterEffect("otlp", "http", {
        endpoint: "https://otel.example.test",
      });
      const valid = yield* isTelemetryExporterDescriptorEffect(descriptor);
      const configuration = yield* normalizeTelemetryConfigurationEffect({
        exporters: { traces: descriptor },
      });
      return { descriptor, valid, configuration };
    }),
  );
  expect(result.valid).toBe(true);
  expect(isTelemetryExporterDescriptor(result.descriptor)).toBe(true);
  expect(result.descriptor).toEqual(
    defineTelemetryExporter("otlp", "http", { endpoint: "https://otel.example.test" }),
  );
  expect(result.configuration).toEqual(
    normalizeTelemetryConfiguration({ exporters: { traces: result.descriptor } }),
  );
});
test("Effect configuration tags invalid input and records failure metrics", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const error = yield* normalizeTelemetryConfigurationEffect({
        exportSampling: { traceRate: 2 },
      }).pipe(Effect.flip);
      const failure = yield* Metric.value(
        Metric.counter("relkit_observability_telemetry_config_total", {
          attributes: { operation: "normalize", outcome: "failure" },
        }),
      );
      yield* normalizeTelemetryConfigurationEffect({});
      const success = yield* Metric.value(
        Metric.counter("relkit_observability_telemetry_config_total", {
          attributes: { operation: "normalize", outcome: "success" },
        }),
      );
      return { error, failure, success };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.error).toMatchObject({ _tag: "TelemetryConfigError" });
  expect(result.failure.count).toBe(1);
  expect(result.success.count).toBe(1);
  expect(() => normalizeTelemetryConfiguration({ exportSampling: { traceRate: 2 } })).toThrow(
    TypeError,
  );
});
