import { describe, expect, test } from "vitest";
import { Effect, Layer } from "effect";
import {
  DEFAULT_TRACE_LIMITS,
  InvocationTelemetry,
  TraceLimitError,
  boundedTraceText,
  boundedTraceTextEffect,
  isReservedTraceKey,
  isReservedTraceKeyEffect,
  safeTraceAttribute,
  safeTraceAttributeEffect,
  traceLimits,
  traceLimitsEffect,
} from "../src/index.js";
import type { InvocationOperation } from "../src/index.js";

describe("trace recording limits", () => {
  test("resolves defaults and immutable overrides", () => {
    const expected = { ...DEFAULT_TRACE_LIMITS, events: 4 };
    expect(Effect.runSync(traceLimitsEffect({ events: 4 }))).toEqual(expected);
    expect(traceLimits({ events: 4 })).toEqual(expected);
    expect(Object.isFrozen(traceLimits())).toBe(true);
  });

  test("reports invalid bounds by tag and preserves TypeError in the adapter", () => {
    for (const events of [0, -1, 1.5, Infinity, NaN]) {
      const failure = Effect.runSync(
        Effect.catchTag(traceLimitsEffect({ events }), "TraceLimitError", (error) =>
          Effect.succeed(error),
        ),
      );
      expect(failure).toBeInstanceOf(TraceLimitError);
      expect(failure.field).toBe("events");
      expect(() => traceLimits({ events })).toThrow(TypeError);
      expect(() => traceLimits({ events })).toThrow("Invalid trace limit: events");
    }
  });

  test("preserves whole UTF-8 characters and supported scalar attributes", () => {
    expect(Effect.runSync(boundedTraceTextEffect("😀😀", 4))).toBe("😀");
    expect(boundedTraceText("😀😀", 3)).toBe("");
    expect(boundedTraceText("hello", 5)).toBe("hello");
    for (const value of ["😀😀", true, 42, Infinity, {}, null]) {
      expect(Effect.runSync(safeTraceAttributeEffect(value, 4))).toEqual(
        safeTraceAttribute(value, 4),
      );
    }
    expect(safeTraceAttribute(Infinity, 4)).toBeUndefined();
  });

  test("recognizes reserved runtime keys", () => {
    for (const key of ["traceId", "parentSpanId", "relkit.invocation.id", "user.tag"]) {
      expect(Effect.runSync(isReservedTraceKeyEffect(key))).toBe(isReservedTraceKey(key));
    }
    expect(isReservedTraceKey("user.tag")).toBe(false);
  });

  test("observes each direct Effect operation through a substitutable Layer", () => {
    const seen: InvocationOperation[] = [];
    const telemetry = Layer.succeed(InvocationTelemetry, {
      observe: <A, E, R>(operation: InvocationOperation, effect: Effect.Effect<A, E, R>) => {
        seen.push(operation);
        return effect;
      },
    });
    Effect.runSync(Effect.provide(traceLimitsEffect(), telemetry));
    Effect.runSync(Effect.provide(boundedTraceTextEffect("hi", 1), telemetry));
    Effect.runSync(Effect.provide(safeTraceAttributeEffect(1, 1), telemetry));
    Effect.runSync(Effect.provide(isReservedTraceKeyEffect("traceId"), telemetry));
    expect(seen).toEqual([
      "trace.limits",
      "trace.bound-text",
      "trace.safe-attribute",
      "trace.reserved-key",
    ]);
  });
});
