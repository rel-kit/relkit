import { Effect, Fiber, Metric } from "effect";
import { expect, test, vi } from "vitest";
import {
  makeTelemetryExporterFanoutEffect,
  telemetryExporterFanoutLayer,
  TelemetryExporterFanoutService,
} from "../src/telemetry-exporters.js";
import type { TelemetryExporterFanoutEffects } from "../src/telemetry-exporters-effect.types.js";
import { admitted, exporter, runtimeModule } from "./telemetry-exporter-fixtures.js";
test("Effect fanout reports typed metadata failure and operation metrics", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const invalid = yield* makeTelemetryExporterFanoutEffect({
        exporters: { missing: exporter("missing") },
        modules: [],
      }).pipe(Effect.flip);
      const fanout = yield* makeTelemetryExporterFanoutEffect({
        exporters: { one: exporter("one") },
        modules: [runtimeModule("one", () => ({ exportRecord: () => undefined }))],
        values: { EXPORT_TOKEN: "resolved-token" },
      });
      yield* fanout.exportRecord(admitted(), "export");
      yield* fanout.flush();
      const stats = yield* fanout.stats();
      const successes = yield* Metric.value(
        Metric.counter("relkit_telemetry_fanout_operations_total", {
          attributes: { operation: "create", outcome: "success" },
        }),
      );
      const failures = yield* Metric.value(
        Metric.counter("relkit_telemetry_fanout_operations_total", {
          attributes: { operation: "create", outcome: "failure" },
        }),
      );
      yield* fanout.close();
      return { invalid, stats, successes, failures };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.invalid).toMatchObject({ _tag: "TelemetryFanoutError", operation: "create" });
  expect(result.stats[0]).toMatchObject({ exported: 1 });
  expect(result.successes.count).toBe(1);
  expect(result.failures.count).toBe(1);
});
test("interrupting a fanout Layer closes its exporter once", async () => {
  let closes = 0;
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let fanout!: TelemetryExporterFanoutEffects;
  const fiber = Effect.runFork(
    Effect.gen(function* () {
      fanout = yield* TelemetryExporterFanoutService;
      ready();
      yield* Effect.never;
    }).pipe(
      Effect.provide(
        telemetryExporterFanoutLayer({
          exporters: { one: exporter("one") },
          modules: [
            runtimeModule("one", () => ({
              exportRecord: () => undefined,
              close: async () => {
                closes++;
              },
            })),
          ],
          values: { EXPORT_TOKEN: "resolved-token" },
        }),
      ),
    ),
  );
  await started;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(closes).toBe(1);
  await Effect.runPromise(fanout.close());
  expect(closes).toBe(1);
});
test("interrupting acquisition aborts factories and closes completed and late lanes", async () => {
  const failures: unknown[] = [];
  let earlyCloses = 0;
  let lateCloses = 0;
  let earlyOpened = 0;
  let signal: AbortSignal | undefined;
  let slowStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    slowStarted = resolve;
  });
  let releaseSlow!: () => void;
  const fast = runtimeModule("fast", () => ({
    exportRecord: () => undefined,
    close: async () => {
      earlyCloses++;
    },
  }));
  const slowBase = runtimeModule("slow", () => ({ exportRecord: () => undefined }));
  const slow = {
    module: {
      ...slowBase.module,
      createTelemetryExporter: (context: { signal?: AbortSignal }) => {
        signal = context.signal;
        slowStarted();
        return new Promise((resolve) => {
          releaseSlow = () =>
            resolve({
              exportRecord: () => undefined,
              close: async () => {
                lateCloses++;
              },
            });
        });
      },
    },
  };
  const fiber = Effect.runFork(
    makeTelemetryExporterFanoutEffect({
      exporters: { fast: exporter("fast"), slow: exporter("slow") },
      modules: [
        {
          module: {
            ...fast.module,
            createTelemetryExporter: (
              ...args: Parameters<typeof fast.module.createTelemetryExporter>
            ) => {
              earlyOpened++;
              return fast.module.createTelemetryExporter(...args);
            },
          },
        },
        slow,
      ],
      values: { EXPORT_TOKEN: "resolved-token" },
      onFailure: (failure) => failures.push(failure),
    }),
  );
  await started;
  await vi.waitFor(() => expect(earlyOpened).toBe(1));
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(signal?.aborted).toBe(true);
  releaseSlow();
  await vi.waitFor(() => expect(earlyCloses).toBe(1));
  await vi.waitFor(() => expect(lateCloses).toBe(1));
  expect(failures).toEqual([]);
});
