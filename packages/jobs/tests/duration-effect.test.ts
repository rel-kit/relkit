import { expect, test } from "vitest";
import { Effect, Layer, Metric, Result } from "effect";
import {
  DurationValidationError,
  durationToMillis,
  durationToMillisEffect,
  isDurationInput,
  isDurationInputEffect,
  parseDuration,
  validateDuration,
} from "../src/duration.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";

test("the Effect path returns exact milliseconds and a tagged validation failure", async () => {
  expect(await Effect.runPromise(durationToMillisEffect("1.5 seconds"))).toBe(1_500);
  const invalid = await Effect.runPromise(
    Effect.result(durationToMillisEffect("1.1 milliseconds")),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) {
    expect(invalid.failure).toBeInstanceOf(DurationValidationError);
    expect(invalid.failure._tag).toBe("Jobs.DurationValidationError");
    expect(invalid.failure.reason).toContain("exact millisecond");
  }
  expect(await Effect.runPromise(isDurationInputEffect("2 days"))).toBe(true);
  expect(await Effect.runPromise(isDurationInputEffect(null))).toBe(false);
});

test("compatibility adapters keep values and TypeError behavior", () => {
  expect(isDurationInput("1 second")).toBe(true);
  expect(durationToMillis("1.5 seconds")).toBe(1_500);
  expect(parseDuration("1 second")).toBe(1_000);
  expect(validateDuration("1 second")).toBe(1_000);
  expect(() => durationToMillis("1.1 milliseconds")).toThrow(TypeError);
});

test("records bounded success, failure, and duration metrics", () => {
  const calls = Metric.counter("relkit_jobs_operations_total", { incremental: true });
  const failures = Metric.counter("relkit_jobs_failures_total", { incremental: true });
  const duration = Metric.histogram("relkit_jobs_duration_ms", {
    boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
  });
  const stats = Effect.runSync(
    Effect.provideService(
      Effect.gen(function* () {
        yield* durationToMillisEffect("1 second");
        yield* Effect.result(durationToMillisEffect("1.1 milliseconds"));
        const attributes = { operation: "duration.toMillis" };
        return {
          calls: (yield* Metric.value(Metric.withAttributes(calls, attributes))).count,
          failures: (yield* Metric.value(Metric.withAttributes(failures, attributes))).count,
          duration: (yield* Metric.value(Metric.withAttributes(duration, attributes))).count,
        };
      }),
      Metric.MetricRegistry,
      new Map(),
    ),
  );
  expect(stats).toEqual({ calls: 2, failures: 1, duration: 2 });
});

test("uses a deterministic telemetry Layer when supplied", async () => {
  const seen: string[] = [];
  const telemetry = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  const result = await Effect.runPromise(
    Effect.provide(durationToMillisEffect("2 seconds"), telemetry),
  );
  expect(result).toBe(2_000);
  expect(seen).toEqual(["duration.toMillis"]);
});
