import { it, expect } from "@effect/vitest";
import { Cause, Clock, Deferred, Effect, Exit, Fiber, Metric, References } from "effect";
import { TestClock } from "effect/testing";
import { observeExecution } from "../src/operation.js";
import { createLoggerLayer, type LogRecord } from "../src/logger.js";

it.effect("observes lazy standalone work and all terminal outcomes", () =>
  Effect.gen(function* () {
    const records: LogRecord[] = [];
    let work = 0;
    const operation = observeExecution(
      "runtime",
      "test.operation",
      Effect.sync(() => ++work),
      () => ({ entries: 2 }),
    );
    expect(work).toBe(0);
    const logger = createLoggerLayer({
      human: { write: (_line, record) => records.push(record) },
      json: false,
      minimumLevel: "trace",
    });
    yield* Effect.gen(function* () {
      expect(yield* operation).toBe(1);
      const failed = yield* Effect.exit(
        observeExecution("runtime", "test.operation", Effect.fail("expected")),
      );
      expect(Exit.isFailure(failed) && Cause.hasFails(failed.cause)).toBe(true);
      const defect = yield* Effect.exit(
        observeExecution("runtime", "test.operation", Effect.die("bug")),
      );
      expect(Exit.isFailure(defect) && Cause.hasDies(defect.cause)).toBe(true);
      const started = yield* Deferred.make<void>();
      const fiber = yield* Effect.forkChild(
        observeExecution(
          "runtime",
          "test.operation",
          Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
        ),
      );
      yield* Deferred.await(started);
      yield* TestClock.adjust(10);
      yield* Fiber.interrupt(fiber);
      const counter = Metric.withAttributes(
        Metric.counter("relkit_execution_operations_total", { incremental: true }),
        { domain: "runtime", operation: "test.operation" },
      );
      expect((yield* Metric.value(counter)).count).toBe(4);
      const workload = Metric.withAttributes(
        Metric.counter("relkit_execution_workload_total", { incremental: true }),
        { domain: "runtime", operation: "test.operation", kind: "entries" },
      );
      expect((yield* Metric.value(workload)).count).toBe(2);
      const timing = Metric.withAttributes(
        Metric.histogram("relkit_execution_duration_ms", {
          boundaries: [0.01, 0.1, 1, 5, 10, 50, 100, 1000, 10000],
        }),
        { domain: "runtime", operation: "test.operation" },
      );
      expect((yield* Metric.value(timing)).sum).toBe(10);
    }).pipe(Effect.provide(logger), Effect.provideService(Metric.MetricRegistry, new Map()));
    expect(records.map((record) => record.fields.outcome)).toEqual([
      "success",
      "failure",
      "defect",
      "interrupted",
    ]);
    expect(records.every((record) => typeof record.fields.duration_ms === "number")).toBe(true);
  }),
);

it.effect("isolates broken observers without changing authoritative results", () =>
  Effect.gen(function* () {
    const logger = createLoggerLayer({
      human: {
        write: () => {
          throw new Error("sink failed");
        },
      },
      json: false,
    });
    const value = yield* observeExecution("runtime", "test.observer", Effect.succeed(42), () => {
      throw new Error("workload failed");
    }).pipe(Effect.provide(logger));
    expect(value).toBe(42);
    const failure = yield* Effect.exit(
      observeExecution("runtime", "test.observer", Effect.fail("original")).pipe(
        Effect.provide(logger),
      ),
    );
    expect(
      Exit.isFailure(failure) &&
        failure.cause.reasons.some(
          (reason) => Cause.isFailReason(reason) && reason.error === "original",
        ),
    ).toBe(true);
  }),
);

it.effect("batched metrics use each execution's registry and inherited attributes", () =>
  Effect.gen(function* () {
    const operation = observeExecution("runtime", "test.registry", Effect.succeed(42), () => ({
      entries: 2,
    }));
    const registryA: Metric.MetricRegistry = new Map();
    const registryB: Metric.MetricRegistry = new Map();
    const attributes = { service: "test" };
    const inspect = Effect.gen(function* () {
      yield* operation;
      const counter = Metric.withAttributes(
        Metric.counter("relkit_execution_operations_total", { incremental: true }),
        { domain: "runtime", operation: "test.registry" },
      );
      return (yield* Metric.value(counter)).count;
    });
    expect(yield* inspect.pipe(Effect.provideService(Metric.MetricRegistry, registryA))).toBe(1);
    expect(
      yield* inspect.pipe(
        Effect.provideService(Metric.MetricRegistry, registryB),
        Effect.provideService(Metric.CurrentMetricAttributes, attributes),
      ),
    ).toBe(1);
    expect(yield* inspect.pipe(Effect.provideService(Metric.MetricRegistry, registryA))).toBe(2);
  }),
);

it.effect("a broken timing observer cannot fail successful domain work", () =>
  Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    const broken = { ...clock, monotonicTimeNanos: Effect.die("timing observer failed") };
    const value = yield* observeExecution("runtime", "test.clock", Effect.succeed(42)).pipe(
      Effect.provideService(Clock.Clock, broken),
    );
    expect(value).toBe(42);
  }),
);

it.effect("child overrides inherit annotations without changing parent or sibling levels", () =>
  Effect.gen(function* () {
    const records: LogRecord[] = [];
    yield* Effect.gen(function* () {
      yield* Effect.logDebug("parent hidden");
      const child = yield* Effect.forkChild(
        Effect.logDebug("child visible").pipe(
          Effect.provideService(References.MinimumLogLevel, "Debug"),
        ),
      );
      const sibling = yield* Effect.forkChild(Effect.logDebug("sibling hidden"));
      yield* Fiber.join(child);
      yield* Fiber.join(sibling);
      yield* Effect.logInfo("parent visible");
    }).pipe(
      Effect.annotateLogs({ requestId: "request-1", token: "secret" }),
      Effect.provide(
        createLoggerLayer({
          minimumLevel: "info",
          json: false,
          human: { write: (_line, record) => records.push(record) },
        }),
      ),
    );
    expect(records.map((record) => record.message)).toEqual(["child visible", "parent visible"]);
    expect(records.every((record) => record.requestId === "request-1")).toBe(true);
    expect(records.every((record) => !JSON.stringify(record).includes("secret"))).toBe(true);
  }),
);
