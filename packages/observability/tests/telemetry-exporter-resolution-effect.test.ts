import { Effect, Fiber, Metric } from "effect";
import { expect, test, vi } from "vitest";
import {
  resolveTelemetryExporterConfiguration,
  resolveTelemetryExporterConfigurationEffect,
  telemetryExporterFactory,
  telemetryExporterFactoryEffect,
} from "../src/telemetry-exporter-resolution.js";
import { exporter, runtimeModule } from "./telemetry-exporter-fixtures.js";
test("exporter resolution has tagged failures, metrics, and compatible adapters", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const config = yield* resolveTelemetryExporterConfigurationEffect(
        "one",
        exporter("one").configuration,
        { EXPORT_TOKEN: "safe" },
      );
      const invalid = yield* telemetryExporterFactoryEffect(exporter("one"), []).pipe(Effect.flip);
      const success = yield* Metric.value(
        Metric.counter("relkit_telemetry_resolution_operations_total", {
          attributes: { operation: "resolveConfiguration", outcome: "success" },
        }),
      );
      const failure = yield* Metric.value(
        Metric.counter("relkit_telemetry_resolution_operations_total", {
          attributes: { operation: "resolveFactory", outcome: "failure" },
        }),
      );
      return { config, invalid, success, failure };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.config).toEqual({ token: "safe" });
  expect(result.invalid).toMatchObject({
    _tag: "TelemetryResolutionError",
    operation: "resolveFactory",
  });
  expect(result.success.count).toBe(1);
  expect(result.failure.count).toBe(1);
  expect(resolveTelemetryExporterConfiguration("one", {}, {})).toEqual({});
  expect(() => telemetryExporterFactory(exporter("one"), [])).toThrow(TypeError);
});
test("interrupting a runtime factory forwards abort and releases a late handle", async () => {
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let release!: () => void;
  let signal: AbortSignal | undefined;
  let closes = 0;
  const base = runtimeModule("one", () => ({ exportRecord: () => undefined }));
  const module = {
    module: {
      ...base.module,
      createTelemetryExporter: (context: { signal?: AbortSignal }) => {
        signal = context.signal;
        started();
        return new Promise((resolve) => {
          release = () =>
            resolve({
              exportRecord: () => undefined,
              close: async () => {
                closes++;
              },
            });
        });
      },
    },
  };
  const factory = Effect.runSync(telemetryExporterFactoryEffect(exporter("one"), [module]));
  const fiber = Effect.runFork(factory({ name: "one", configuration: {} }));
  await ready;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(signal?.aborted).toBe(true);
  release();
  await vi.waitFor(() => expect(closes).toBe(1));
});
