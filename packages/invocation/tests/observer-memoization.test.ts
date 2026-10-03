import { expect, test } from "vitest";
import { Cause, Clock, Effect, Exit, Metric } from "effect";
import { InvocationTelemetry, observeInvocation } from "../src/invocation-observability.js";

const operation = "handler.invoke";
const calls = Metric.counter("relkit_invocation_operations_total", {
  incremental: true,
  attributes: { operation },
});

test("memoized handles resolve each registry and inherited attributes at execution", () => {
  let executions = 0;
  const observed = observeInvocation(
    operation,
    Effect.sync(() => ++executions),
  );
  const registryA: Metric.MetricRegistry = new Map();
  const registryB: Metric.MetricRegistry = new Map();
  expect(executions).toBe(0);
  expect(registryA.size).toBe(0);
  const inspect = Effect.gen(function* () {
    yield* observed;
    return (yield* Metric.value(calls)).count;
  });
  const run = (registry: Metric.MetricRegistry, attributes: Record<string, string> = {}) =>
    Effect.runSync(
      inspect.pipe(
        Effect.provideService(Metric.MetricRegistry, registry),
        Effect.provideService(Metric.CurrentMetricAttributes, attributes),
      ),
    );
  expect(run(registryA)).toBe(1);
  expect(run(registryB)).toBe(1);
  expect(run(registryA, { service: "first" })).toBe(1);
  expect(run(registryA, { service: "second" })).toBe(1);
  expect(run(registryA, { service: "first" })).toBe(2);
  expect(run(registryA)).toBe(2);
  expect(executions).toBe(6);
});

test("owned operation labels take precedence over conflicting caller attributes", () => {
  const registry: Metric.MetricRegistry = new Map();
  Effect.runSync(
    observeInvocation(operation, Effect.void).pipe(
      Effect.provideService(Metric.MetricRegistry, registry),
      Effect.provideService(Metric.CurrentMetricAttributes, {
        operation: "request-owned-value",
        service: "orders",
      }),
    ),
  );
  expect([...registry.values()].map((metadata) => metadata.attributes)).toEqual([
    { operation, service: "orders" },
    { operation, service: "orders" },
  ]);
});

test("shared observer preserves caller timing and original failure causes", () => {
  const registry: Metric.MetricRegistry = new Map();
  Effect.runSync(
    Effect.gen(function* () {
      const clock = yield* Clock.Clock;
      let nanos = 0n;
      const controlledClock: Clock.Clock = {
        currentTimeMillisUnsafe: () => clock.currentTimeMillisUnsafe(),
        currentTimeMillis: clock.currentTimeMillis,
        currentTimeNanosUnsafe: () => clock.currentTimeNanosUnsafe(),
        currentTimeNanos: clock.currentTimeNanos,
        monotonicTimeNanosUnsafe: () => nanos,
        monotonicTimeNanos: Effect.sync(() => nanos),
        sleep: (duration) => clock.sleep(duration),
      };
      const timed = <A, E>(effect: Effect.Effect<A, E>) =>
        observeInvocation(
          operation,
          Effect.sync(() => {
            nanos += 7_000_000n;
          }).pipe(Effect.andThen(effect)),
        ).pipe(Effect.provideService(Clock.Clock, controlledClock));
      expect(yield* timed(Effect.succeed("value"))).toBe("value");
      const failure = yield* Effect.exit(timed(Effect.fail("expected")));
      expect(Exit.isFailure(failure) && Cause.squash(failure.cause)).toBe("expected");
      const defect = new Error("defect");
      const died = yield* Effect.exit(timed(Effect.die(defect)));
      expect(Exit.isFailure(died) && Cause.squash(died.cause)).toBe(defect);
      const interrupted = yield* Effect.exit(timed(Effect.interrupt));
      expect(Exit.isFailure(interrupted) && Cause.hasInterruptsOnly(interrupted.cause)).toBe(true);
      expect((yield* Metric.value(calls)).count).toBe(4);
      const failures = Metric.counter("relkit_invocation_failures_total", {
        incremental: true,
        attributes: { operation },
      });
      expect((yield* Metric.value(failures)).count).toBe(3);
      const duration = Metric.histogram("relkit_invocation_duration_ms", {
        boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
        attributes: { operation },
      });
      const timing = yield* Metric.value(duration);
      expect(timing.count).toBe(4);
      expect(timing.sum).toBe(28);
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
});

test("substitution and observed work stay lazy when the same effect is rerun", () => {
  const names: string[] = [];
  let executions = 0;
  const observed = observeInvocation(
    operation,
    Effect.sync(() => ++executions),
  ).pipe(
    Effect.provideService(InvocationTelemetry, {
      observe: (name, effect) => {
        names.push(name);
        return effect;
      },
    }),
  );
  expect(names).toEqual([]);
  expect(executions).toBe(0);
  expect(Effect.runSync(observed)).toBe(1);
  expect(Effect.runSync(observed)).toBe(2);
  expect(names).toEqual([operation, operation]);
});
