import { defineEnv, env } from "@relkit/config";
import { Effect, Layer, Metric, Result } from "effect";
import { expect, test } from "vitest";
import {
  AppValidationFailure,
  assertExclusiveAlias,
  assertExclusiveAliasEffect,
  deriveApplicationId,
  deriveApplicationIdEffect,
  isEnvDefinition,
  isEnvDefinitionEffect,
  normalizeCompatibility,
  normalizeCompatibilityEffect,
} from "../src/app-validation.js";
import { AppTelemetry } from "../src/app-observability.js";

test("validates complete environment definitions through Effect and the guard", () => {
  const valid = defineEnv({ REGION: env.string() });
  expect(Effect.runSync(isEnvDefinitionEffect(valid))).toBe(true);
  expect(isEnvDefinition(valid)).toBe(true);
  for (const invalid of [
    null,
    [],
    { kind: "env-definition" },
    { kind: "env-definition", shape: { X: {} } },
    { kind: "env-definition", shape: { X: { kind: "env-builder" } } },
    { kind: "env-definition", shape: { X: { kind: "env-builder", parse: () => "" } } },
    {
      kind: "env-definition",
      shape: { X: { kind: "env-builder", parse: () => "", getDefault: () => "" } },
    },
  ]) {
    expect(Effect.runSync(isEnvDefinitionEffect(invalid))).toBe(false);
    expect(isEnvDefinition(invalid)).toBe(false);
  }
});

test("derives stable IDs and retains original errors for synchronous callers", () => {
  expect(Effect.runSync(deriveApplicationIdEffect("@acme/orders"))).toBe("acme.orders");
  expect(deriveApplicationId("@acme/orders")).toBe("acme.orders");
  const invalid = Effect.runSync(Effect.result(deriveApplicationIdEffect("@")));
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) {
    expect(invalid.failure).toBeInstanceOf(AppValidationFailure);
    expect(invalid.failure._tag).toBe("AppValidationFailure");
  }
  expect(() => deriveApplicationId("@")).toThrow("Invalid stable ID");
});

test("normalizes compatibility and rejects invalid flags and aliases", () => {
  expect(Effect.runSync(normalizeCompatibilityEffect(undefined))).toEqual({ legacyJobs: false });
  expect(normalizeCompatibility({ legacyJobs: true })).toEqual({ legacyJobs: true });
  expect(Object.isFrozen(normalizeCompatibility({}))).toBe(true);
  const invalid = Effect.runSync(
    Effect.result(normalizeCompatibilityEffect({ legacyJobs: "yes" } as never)),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure._tag).toBe("AppValidationFailure");
  expect(() => normalizeCompatibility({ legacyJobs: "yes" } as never)).toThrow("must be a boolean");
  const poisoned = Object.defineProperty({}, "legacyJobs", {
    get: () => {
      throw "invalid getter";
    },
  });
  const thrown = Effect.runSync(Effect.result(normalizeCompatibilityEffect(poisoned)));
  expect(Result.isFailure(thrown)).toBe(true);
  if (Result.isFailure(thrown)) expect(thrown.failure.message).toBe("invalid getter");
  expect(
    Effect.runSync(assertExclusiveAliasEffect({ jobs: 1 }, "jobs", "job", "defineApp")),
  ).toBeUndefined();
  const alias = Effect.runSync(
    Effect.result(assertExclusiveAliasEffect({ jobs: 1, job: 2 }, "jobs", "job", "defineApp")),
  );
  expect(Result.isFailure(alias)).toBe(true);
  expect(() => assertExclusiveAlias({ jobs: 1, job: 2 }, "jobs", "job", "defineApp")).toThrow(
    'cannot specify both "jobs" and "job"',
  );
});

test("records success, failure, and duration metrics with bounded labels", () => {
  const calls = Metric.counter("relkit_app_operations_total", { incremental: true });
  const failures = Metric.counter("relkit_app_failures_total", { incremental: true });
  const duration = Metric.histogram("relkit_app_duration_ms", {
    boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
  });
  const stats = Effect.runSync(
    Effect.provideService(
      Effect.gen(function* () {
        yield* deriveApplicationIdEffect("@acme/orders");
        yield* Effect.result(deriveApplicationIdEffect("@"));
        const attributes = { operation: "id.derive" };
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

test("uses the supplied telemetry Layer", () => {
  const operations: string[] = [];
  const layer = Layer.succeed(
    AppTelemetry,
    AppTelemetry.of({
      observe: (operation, effect) => {
        operations.push(operation);
        return effect;
      },
    }),
  );
  expect(Effect.runSync(Effect.provide(deriveApplicationIdEffect("orders"), layer))).toBe("orders");
  expect(operations).toEqual(["id.derive"]);
});
