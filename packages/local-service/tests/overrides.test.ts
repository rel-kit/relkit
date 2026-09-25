import { Effect, Layer, Metric, Result, Tracer } from "effect";
import { expect, test } from "vitest";
import {
  LocalServiceTelemetry,
  LocalServiceValidationFailure,
  LocalServiceVersionError,
  assertLocalServicePlanVersion,
  assertLocalServicePlanVersionEffect,
  assertLocalServiceStateVersion,
  assertLocalServiceStateVersionEffect,
  assertProviderOverrideStateVersion,
  assertProviderOverrideStateVersionEffect,
  providerOverrideBindingValues,
  providerOverrideBindingValuesEffect,
} from "../src/index.js";

const hash = "sha256:" + "a".repeat(64);
const expected = { applicationId: "example", planHash: hash, generationId: "generation-1" };
const valid = {
  version: 1,
  applicationId: "example",
  localProjectId: hash,
  planHash: hash,
  generationId: "generation-1",
  bindings: [{ bindingId: "provider.cache.default", values: { url: "redis://local" } }],
};

test("version checks accept supported values and preserve legacy stale-version guidance", () => {
  for (const [effect, adapter, code] of [
    [
      assertLocalServicePlanVersionEffect,
      assertLocalServicePlanVersion,
      "RELKIT_LOCAL_SERVICE_PLAN_VERSION_UNSUPPORTED",
    ],
    [
      assertLocalServiceStateVersionEffect,
      assertLocalServiceStateVersion,
      "RELKIT_LOCAL_SERVICE_STATE_VERSION_UNSUPPORTED",
    ],
    [
      assertProviderOverrideStateVersionEffect,
      assertProviderOverrideStateVersion,
      "RELKIT_PROVIDER_OVERRIDE_STATE_VERSION_UNSUPPORTED",
    ],
  ] as const) {
    expect(Effect.runSync(effect({ version: 1 }))).toBeUndefined();
    expect(adapter({ version: 1 })).toBeUndefined();
    const failure = Effect.runSync(Effect.result(effect({ version: 0 })));
    expect(Result.isFailure(failure)).toBe(true);
    if (Result.isFailure(failure)) expect(failure.failure.code).toBe(code);
    expect(() => adapter({ version: 0 })).toThrow(LocalServiceVersionError);
  }
  expect(() => assertLocalServicePlanVersion(null)).toThrow("version undefined");
  expect(() => assertLocalServicePlanVersion([])).toThrow("version undefined");
});

test("override resolution returns frozen values and a typed validation failure", () => {
  const resolved = Effect.runSync(providerOverrideBindingValuesEffect(valid, expected));
  expect(resolved).toEqual({ "provider.cache.default": { url: "redis://local" } });
  expect(Object.isFrozen(resolved)).toBe(true);
  expect(providerOverrideBindingValues(valid, expected)).toEqual(resolved);
  const result = Effect.runSync(
    Effect.result(
      providerOverrideBindingValuesEffect(valid, { ...expected, generationId: "other" }),
    ),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result))
    expect(result.failure).toBeInstanceOf(LocalServiceValidationFailure);
  expect(() =>
    providerOverrideBindingValues(valid, { ...expected, generationId: "other" }),
  ).toThrow(TypeError);
});

test.each([
  ["application mismatch", { ...valid, applicationId: "other" }],
  ["plan mismatch", { ...valid, planHash: "sha256:" + "b".repeat(64) }],
  ["invalid application", { ...valid, applicationId: "with space" }],
  ["invalid generation", { ...valid, generationId: "bad generation" }],
  ["invalid project hash", { ...valid, localProjectId: "bad" }],
  ["invalid plan hash", { ...valid, planHash: "bad" }],
  ["missing bindings", { ...valid, bindings: null }],
  ["invalid binding", { ...valid, bindings: [null] }],
  ["invalid binding id", { ...valid, bindings: [{ bindingId: "bad id", values: {} }] }],
  ["invalid values object", { ...valid, bindings: [{ bindingId: "valid", values: [] }] }],
  ["invalid value key", { ...valid, bindings: [{ bindingId: "valid", values: { "bad key": 1 } }] }],
  [
    "duplicate binding",
    {
      ...valid,
      bindings: [
        { bindingId: "valid", values: {} },
        { bindingId: "valid", values: {} },
      ],
    },
  ],
  [
    "invalid JSON value",
    { ...valid, bindings: [{ bindingId: "valid", values: { invalid: undefined } }] },
  ],
])("rejects %s", (_name, artifact) => {
  expect(() => providerOverrideBindingValues(artifact, expected)).toThrow("runtime activation");
});

test("override validation preserves version error precedence", () => {
  expect(() =>
    providerOverrideBindingValues({ ...valid, version: 0, bindings: null }, expected),
  ).toThrow(LocalServiceVersionError);
});

test("injected telemetry Layer sees success and failure with fixed labels", () => {
  const observed: string[] = [];
  const telemetry = Layer.succeed(LocalServiceTelemetry, {
    observe: (operation, effect) => {
      observed.push(operation);
      return effect;
    },
  });
  Effect.runSync(Effect.provide(assertLocalServicePlanVersionEffect({ version: 1 }), telemetry));
  Effect.runSync(
    Effect.provide(Effect.result(providerOverrideBindingValuesEffect({}, expected)), telemetry),
  );
  expect(observed).toEqual(["plan.assert-version", "override.binding-values"]);
});

test("live telemetry records success, failure, and duration once per operation", () => {
  const registry: Metric.MetricRegistry = new Map();
  const spans: string[] = [];
  const tracer = Tracer.make({
    span(options) {
      if (options.name.startsWith("local-service.")) spans.push(options.name);
      return Tracer.nativeTracer.span(options);
    },
  });
  const calls = Metric.withAttributes(
    Metric.counter("relkit_local_service_operations_total", { incremental: true }),
    { operation: "override.binding-values" },
  );
  const failures = Metric.withAttributes(
    Metric.counter("relkit_local_service_failures_total", { incremental: true }),
    { operation: "override.binding-values" },
  );
  const duration = Metric.withAttributes(
    Metric.histogram("relkit_local_service_duration_ms", {
      boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
    }),
    { operation: "override.binding-values" },
  );
  const result = Effect.runSync(
    Effect.withTracer(
      Effect.provideService(
        Effect.gen(function* () {
          yield* providerOverrideBindingValuesEffect(valid, expected);
          yield* Effect.result(providerOverrideBindingValuesEffect({}, expected));
          return {
            calls: (yield* Metric.value(calls)).count,
            failures: (yield* Metric.value(failures)).count,
            duration: (yield* Metric.value(duration)).count,
          };
        }),
        Metric.MetricRegistry,
        registry,
      ),
      tracer,
    ),
  );
  expect(result).toEqual({ calls: 2, failures: 1, duration: 2 });
  expect(spans).toEqual([
    "local-service.override.binding-values",
    "local-service.override.binding-values",
  ]);
});
