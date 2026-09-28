import { describe, expect, test } from "vitest";
import { Effect, Layer, Metric, Tracer } from "effect";
import {
  freezeServiceContextValue,
  freezeServiceContextValueEffect,
  isServiceRefEffect,
  normalizeServiceMemberNameEffect,
  observeService,
  ServiceTelemetry,
  ServiceTelemetryLive,
} from "../src/index.js";
import {
  assertUniqueServiceMembersEffect,
  copyServiceMembersEffect,
} from "../src/service-members.js";
import { runServiceSync } from "../src/service-observability.js";

describe("context and telemetry", () => {
  test("freezes plain graphs, cycles, and repeated references", () => {
    const shared = { enabled: true };
    const source: { left: object; right: object; self?: object } = { left: shared, right: shared };
    source.self = source;
    const result = freezeServiceContextValue(source, new WeakMap()) as typeof source;
    expect(result).not.toBe(source);
    expect(result.left).toBe(result.right);
    expect(result.self).toBe(result);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.left)).toBe(true);
    const array = Effect.runSync(
      freezeServiceContextValueEffect([1, { x: 2 }], new WeakMap()),
    ) as unknown[];
    expect(Object.isFrozen(array)).toBe(true);
    expect(Object.isFrozen(array[1])).toBe(true);
    const date = new Date();
    expect(freezeServiceContextValue(date, new WeakMap())).toBe(date);
    expect(freezeServiceContextValue(null, new WeakMap())).toBeNull();
  });

  test("reports copy and collision failures with tagged errors", () => {
    const invalid = Effect.runSync(
      Effect.flip(
        copyServiceMembersEffect({ wrong: 1 }, (value) => Effect.succeed(value === 2), "function"),
      ),
    );
    expect(invalid._tag).toBe("ServiceValidationError");
    expect(invalid.message).toContain("Invalid service function");
    const collision = Effect.runSync(
      Effect.flip(assertUniqueServiceMembersEffect({ same: 1 }, { same: 2 })),
    );
    expect(collision.message).toContain("Duplicate service member");
    expect(Effect.runSync(assertUniqueServiceMembersEffect({}, {}))).toBeUndefined();
    expect(
      Effect.runSync(
        copyServiceMembersEffect(
          { toString: 2 },
          (value) => Effect.succeed(value === 2),
          "function",
        ),
      ),
    ).toEqual({ toString: 2 });
  });

  test("records live success and failure metrics", () => {
    const registry: Metric.MetricRegistry = new Map();
    const program = Effect.gen(function* () {
      yield* isServiceRefEffect({});
      yield* Effect.exit(normalizeServiceMemberNameEffect(""));
      const calls = yield* Metric.value(
        Metric.withAttributes(
          Metric.counter("relkit_service_operations_total", { incremental: true }),
          { operation: "member.normalize" },
        ),
      );
      const successCalls = yield* Metric.value(
        Metric.withAttributes(
          Metric.counter("relkit_service_operations_total", { incremental: true }),
          { operation: "ref.is" },
        ),
      );
      const failures = yield* Metric.value(
        Metric.withAttributes(
          Metric.counter("relkit_service_failures_total", { incremental: true }),
          { operation: "member.normalize" },
        ),
      );
      const duration = yield* Metric.value(
        Metric.withAttributes(
          Metric.histogram("relkit_service_duration_ms", {
            boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
          }),
          { operation: "member.normalize" },
        ),
      );
      return { calls, successCalls, failures, duration };
    });
    const result = Effect.runSync(Effect.provideService(program, Metric.MetricRegistry, registry));
    expect(result.calls.count).toBe(1);
    expect(result.successCalls.count).toBe(1);
    expect(result.failures.count).toBe(1);
    expect(result.duration.count).toBe(1);
  });

  test("uses an injected telemetry Layer", () => {
    const seen: string[] = [];
    const layer = Layer.succeed(
      ServiceTelemetry,
      ServiceTelemetry.of({
        observe: (operation, effect) => {
          seen.push(operation);
          return effect;
        },
      }),
    );
    expect(Effect.runSync(Effect.provide(isServiceRefEffect({}), layer))).toBe(false);
    expect(seen).toEqual(["ref.is"]);
    expect(Effect.runSync(Effect.provide(isServiceRefEffect({}), ServiceTelemetryLive))).toBe(
      false,
    );
  });

  test("emits fixed spans for success and typed failure", () => {
    const spans: string[] = [];
    const tracer = Tracer.make({
      span(options) {
        spans.push(options.name);
        return Tracer.nativeTracer.span(options);
      },
    });
    Effect.runSync(
      Effect.withTracer(
        Effect.gen(function* () {
          yield* observeService("ref.is", Effect.succeed(false));
          yield* Effect.flip(normalizeServiceMemberNameEffect(""));
        }),
        tracer,
      ),
    );
    expect(spans).toContain("services.ref.is");
    expect(spans).toContain("services.member.normalize");
  });

  test("preserves an unexpected defect at a synchronous boundary", () => {
    const defect = new Error("unexpected");
    expect(() => runServiceSync(Effect.die(defect))).toThrow(defect);
  });
});
