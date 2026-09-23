import { describe, expect, test } from "vitest";
import { Effect, Exit, Metric } from "effect";
import {
  createDescriptorBase,
  createSourceLocation,
  createSourceLocationEffect,
  isDescriptor,
  JsonValueError,
  normalizeId,
  normalizeIdEffect,
  serializeJson,
  serializeJsonEffect,
  SourceLocationError,
  StableIdError,
} from "../src/index.js";

describe("Effect contract operations", () => {
  test("preserves synchronous error types and successful values", () => {
    expect(normalizeId(" orders.get ")).toBe("orders.get");
    expect(() => normalizeId("/bad")).toThrow(StableIdError);
    expect(serializeJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => serializeJson(cycle)).toThrow(JsonValueError);
    expect(createSourceLocation("src/app.ts", 2, 3)).toEqual({
      file: "src/app.ts",
      line: 2,
      column: 3,
    });
    expect(() => createSourceLocation("src/app.ts", 0, 1)).toThrow(SourceLocationError);
    const descriptor = createDescriptorBase("route", "orders.get");
    expect(isDescriptor(descriptor, "route")).toBe(true);
    expect(Object.isFrozen(descriptor)).toBe(true);
  });

  test("records failure metrics on typed Effect error paths", () => {
    const registry: Metric.MetricRegistry = new Map();
    const program = Effect.gen(function* () {
      const valid = yield* normalizeIdEffect("orders.get");
      const badId = yield* Effect.exit(normalizeIdEffect("/bad"));
      const badPath = yield* Effect.exit(createSourceLocationEffect("src/app.ts", 0, 1));
      const badJson = yield* Effect.exit(serializeJsonEffect(undefined));
      const idFailures = yield* Metric.value(
        Metric.withAttributes(
          Metric.counter("relkit_contract_failures_total", { incremental: true }),
          { operation: "id.normalize" },
        ),
      );
      const pathFailures = yield* Metric.value(
        Metric.withAttributes(
          Metric.counter("relkit_contract_failures_total", { incremental: true }),
          { operation: "source-location.create" },
        ),
      );
      const jsonFailures = yield* Metric.value(
        Metric.withAttributes(
          Metric.counter("relkit_contract_failures_total", { incremental: true }),
          { operation: "json.serialize" },
        ),
      );
      return { valid, badId, badPath, badJson, idFailures, pathFailures, jsonFailures };
    });
    const result = Effect.runSync(Effect.provideService(program, Metric.MetricRegistry, registry));
    expect(result.valid).toBe("orders.get");
    expect(Exit.isFailure(result.badId)).toBe(true);
    expect(Exit.isFailure(result.badPath)).toBe(true);
    expect(Exit.isFailure(result.badJson)).toBe(true);
    expect(result.idFailures.count).toBe(1);
    expect(result.pathFailures.count).toBe(1);
    expect(result.jsonFailures.count).toBe(1);
  });
});
