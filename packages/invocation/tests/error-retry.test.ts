import { describe, expect, test } from "vitest";
import { Effect, Layer, Metric, Tracer } from "effect";
import {
  ErrorRetryValidationError,
  InvocationTelemetry,
  normalizeErrorRetry,
  normalizeErrorRetryEffect,
  observeInvocation,
} from "../src/index.js";
import type { InvocationOperation } from "../src/index.js";

describe("declared error retry", () => {
  test("normalizes every accepted shape through Effect and the sync adapter", () => {
    for (const [value, afterMs, expected] of [
      [undefined, undefined, { retry: "never" }],
      ["never", undefined, { retry: "never" }],
      ["later", undefined, { retry: "later" }],
      ["later", 0, { retry: "later", afterMs: 0 }],
      [{ kind: "later", afterMs: 5 }, undefined, { retry: "later", afterMs: 5 }],
      [{ kind: "later", afterMs: 5 }, 5, { retry: "later", afterMs: 5 }],
    ] as const) {
      expect(Effect.runSync(normalizeErrorRetryEffect(value, afterMs))).toEqual(expected);
      expect(normalizeErrorRetry(value, afterMs)).toEqual(expected);
      expect(Object.isFrozen(normalizeErrorRetry(value, afterMs))).toBe(true);
    }
  });

  test("fails by tag in Effect and retains TypeError messages in the adapter", () => {
    for (const [value, afterMs, field] of [
      ["never", 1, "retry"],
      ["soon", undefined, "retry"],
      [{ kind: "later", afterMs: 5 }, 6, "retry"],
      ["later", -1, "afterMs"],
      ["later", 1.5, "afterMs"],
      ["later", Number.MAX_SAFE_INTEGER + 1, "afterMs"],
    ] as const) {
      const error = Effect.runSync(
        Effect.catchTag(normalizeErrorRetryEffect(value, afterMs), "ErrorRetryValidationError", (e) =>
          Effect.succeed(e),
        ),
      );
      expect(error).toBeInstanceOf(ErrorRetryValidationError);
      expect(error.field).toBe(field);
      expect(() => normalizeErrorRetry(value, afterMs)).toThrow(TypeError);
      expect(() => normalizeErrorRetry(value, afterMs)).toThrow(error.message);
    }
  });

  test("supports an observer Layer without changing failures", () => {
    const seen: InvocationOperation[] = [];
    const layer = Layer.succeed(InvocationTelemetry, {
      observe: <A, E, R>(operation: InvocationOperation, effect: Effect.Effect<A, E, R>) => {
        seen.push(operation);
        return effect;
      },
    });
    const result = Effect.runSync(
      Effect.provide(
        Effect.catchTag(normalizeErrorRetryEffect("invalid"), "ErrorRetryValidationError", (e) =>
          Effect.succeed(e.field),
        ),
        layer,
      ),
    );
    expect(result).toBe("retry");
    expect(seen).toEqual(["retry.normalize"]);
  });

  test("creates an operation span inside an existing span", () => {
    const names = Effect.runSync(Effect.withSpan(Effect.gen(function* () {
      const parent = (yield* Effect.currentSpan).name;
      const child = yield* observeInvocation(
        "retry.normalize",
        Effect.map(Effect.currentSpan, (span) => span.name),
      );
      return { parent, child };
    }), "existing.parent"));
    expect(names).toEqual({ parent: "existing.parent", child: "invocation.retry.normalize" });
  });

  test("records success and failure metrics with fixed labels", () => {
    const operation = "retry.normalize";
    const calls = Metric.withAttributes(
      Metric.counter("relkit_invocation_operations_total", { incremental: true }),
      { operation },
    );
    const failures = Metric.withAttributes(
      Metric.counter("relkit_invocation_failures_total", { incremental: true }),
      { operation },
    );
    const duration = Metric.withAttributes(
      Metric.histogram("relkit_invocation_duration_ms", {
        boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
      }),
      { operation },
    );
    const counts = () =>
      Effect.runSync(
        Effect.gen(function* () {
          return {
            calls: (yield* Metric.value(calls)).count,
            failures: (yield* Metric.value(failures)).count,
            duration: (yield* Metric.value(duration)).count,
          };
        }),
      );
    const before = counts();
    Effect.runSync(normalizeErrorRetryEffect("never"));
    Effect.runSync(
      Effect.catchTag(normalizeErrorRetryEffect("invalid"), "ErrorRetryValidationError", () =>
        Effect.void,
      ),
    );
    const after = counts();
    expect(after.calls - before.calls).toBe(2);
    expect(after.failures - before.failures).toBe(1);
    expect(after.duration - before.duration).toBe(2);
  });

  test("uses the same span name for success and failure", () => {
    const names: string[] = [];
    const tracer = Tracer.make({
      span(options) {
        names.push(options.name);
        return Tracer.nativeTracer.span(options);
      },
    });
    Effect.runSync(Effect.withTracer(normalizeErrorRetryEffect("never"), tracer));
    Effect.runSync(
      Effect.withTracer(
        Effect.catchTag(normalizeErrorRetryEffect("invalid"), "ErrorRetryValidationError", () =>
          Effect.void,
        ),
        tracer,
      ),
    );
    expect(names).toEqual(["invocation.retry.normalize", "invocation.retry.normalize"]);
  });
});
