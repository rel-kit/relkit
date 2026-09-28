import { Effect, Layer, Metric, Result, Tracer } from "effect";
import { expect, test } from "vitest";
import {
  currentRealtimeDispatcher,
  currentRealtimeDispatcherEffect,
  RealtimeDispatcherLive,
  RealtimeDispatcherService,
  runWithRealtimeDispatcher,
  runWithRealtimeDispatcherEffect,
  setActiveRealtimeDispatcher,
  setActiveRealtimeDispatcherEffect,
} from "../src/dispatch.js";
import { RealtimeTelemetry } from "../src/realtime-observability.js";
import { fixturePresence, fixtureReceipt } from "./provider-fixture.js";
const dispatcher = {
  trigger: async () => fixtureReceipt(),
  getPresence: async () => fixturePresence(),
};
test("dispatcher scope overrides fallback and restores outer binding", async () => {
  setActiveRealtimeDispatcher(undefined);
  expect(Effect.runSync(Effect.flip(currentRealtimeDispatcherEffect()))).toMatchObject({
    _tag: "Realtime.DispatcherError",
    reason: "No realtime dispatcher is active.",
  });
  expect(() => currentRealtimeDispatcher()).toThrow("No realtime dispatcher is active.");
  Effect.runSync(setActiveRealtimeDispatcherEffect(dispatcher));
  expect(currentRealtimeDispatcher()).toBe(dispatcher);
  expect(
    Effect.runSync(
      Effect.provide(Effect.service(RealtimeDispatcherService), RealtimeDispatcherLive),
    ),
  ).toBe(dispatcher);
  const scoped = { ...dispatcher };
  expect(
    await runWithRealtimeDispatcher(scoped, async () => {
      await Promise.resolve();
      return currentRealtimeDispatcher();
    }),
  ).toBe(scoped);
  expect(currentRealtimeDispatcher()).toBe(dispatcher);
  expect(
    Effect.runSync(runWithRealtimeDispatcherEffect(scoped, () => currentRealtimeDispatcher())),
  ).toBe(scoped);
  expect(runWithRealtimeDispatcher(scoped, () => 7)).toBe(7);
  const original = Promise.resolve(8);
  expect(runWithRealtimeDispatcher(scoped, () => original)).toBe(original);
  const thrown = new Error("action failed");
  expect(() =>
    runWithRealtimeDispatcher(scoped, () => {
      throw thrown;
    }),
  ).toThrow(thrown);
  expect(currentRealtimeDispatcher()).toBe(dispatcher);
  expect(
    Effect.runSync(
      Effect.flip(
        runWithRealtimeDispatcherEffect(scoped, () => {
          throw thrown;
        }),
      ),
    ),
  ).toMatchObject({ _tag: "Realtime.ActionError", operation: "dispatch.runWith" });
  await expect(
    runWithRealtimeDispatcher(scoped, async () => {
      throw thrown;
    }),
  ).rejects.toBe(thrown);
  expect(currentRealtimeDispatcher()).toBe(dispatcher);
  setActiveRealtimeDispatcher(undefined);
});
test("dispatcher and telemetry services can be replaced by Layers", () => {
  const observations: string[] = [];
  const telemetry = Layer.succeed(RealtimeTelemetry, {
    observe: (name, effect) =>
      Effect.ensuring(
        effect,
        Effect.sync(() => {
          observations.push(name);
        }),
      ),
  });
  const binding = Layer.succeed(RealtimeDispatcherService, dispatcher);
  const service = Effect.gen(function* () {
    return yield* RealtimeDispatcherService;
  });
  expect(Effect.runSync(Effect.provide(service, binding))).toBe(dispatcher);
  Effect.runSync(Effect.provide(setActiveRealtimeDispatcherEffect(undefined), telemetry));
  expect(observations).toEqual(["dispatch.setActive"]);
});
test("asynchronous Effect actions keep failures and metrics inside their lifetime", async () => {
  const error = new Error("async failure");
  const registry: Metric.MetricRegistry = new Map();
  const failures = Metric.withAttributes(
    Metric.counter("relkit_realtime_failures_total", { incremental: true }),
    { operation: "dispatch.runWith" },
  );
  const duration = Metric.withAttributes(
    Metric.histogram("relkit_realtime_duration_ms", { boundaries: [0.01, 0.1, 1, 5, 10, 50, 100] }),
    { operation: "dispatch.runWith" },
  );
  const program = Effect.gen(function* () {
    const result = yield* Effect.result(
      runWithRealtimeDispatcherEffect(dispatcher, async () => {
        await Promise.resolve();
        throw error;
      }),
    );
    return {
      failure: Result.isFailure(result) ? result.failure : undefined,
      failures: (yield* Metric.value(failures)).count,
      duration: (yield* Metric.value(duration)).count,
    };
  });
  expect(
    await Effect.runPromise(Effect.provideService(program, Metric.MetricRegistry, registry)),
  ).toMatchObject({
    failure: { _tag: "Realtime.ActionError", operation: "dispatch.runWith", cause: error },
    failures: 1,
    duration: 1,
  });
  const value: number = await Effect.runPromise(
    runWithRealtimeDispatcherEffect(dispatcher, async () => 7),
  );
  expect(value).toBe(7);
});
test("live success and failure metrics and spans use bounded operation names", () => {
  const registry: Metric.MetricRegistry = new Map();
  const calls = Metric.withAttributes(
    Metric.counter("relkit_realtime_operations_total", { incremental: true }),
    { operation: "dispatch.current" },
  );
  const failures = Metric.withAttributes(
    Metric.counter("relkit_realtime_failures_total", { incremental: true }),
    { operation: "dispatch.current" },
  );
  const duration = Metric.withAttributes(
    Metric.histogram("relkit_realtime_duration_ms", { boundaries: [0.01, 0.1, 1, 5, 10, 50, 100] }),
    { operation: "dispatch.current" },
  );
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  setActiveRealtimeDispatcher(undefined);
  const metrics = Effect.gen(function* () {
    yield* Effect.flip(currentRealtimeDispatcherEffect());
    yield* setActiveRealtimeDispatcherEffect(dispatcher);
    yield* currentRealtimeDispatcherEffect();
    return {
      calls: (yield* Metric.value(calls)).count,
      failures: (yield* Metric.value(failures)).count,
      duration: (yield* Metric.value(duration)).count,
    };
  });
  expect(
    Effect.runSync(
      Effect.provideService(Effect.withTracer(metrics, tracer), Metric.MetricRegistry, registry),
    ),
  ).toEqual({ calls: 2, failures: 1, duration: 2 });
  expect(spans.map((span) => span.name)).toContain("realtime.dispatch.current");
  setActiveRealtimeDispatcher(undefined);
});
