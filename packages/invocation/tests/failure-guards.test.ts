import { describe, expect, test } from "vitest";
import { Cause, Effect, Layer } from "effect";
import {
  InvocationTelemetry,
  RequiredTextError,
  isCancellation,
  isCancellationEffect,
  isDeclaredError,
  isDeclaredErrorEffect,
  isDependencyNotConfigured,
  isDependencyNotConfiguredEffect,
  isFunctionFailure,
  isFunctionFailureEffect,
  isProviderError,
  isProviderErrorEffect,
  isTimeout,
  isTimeoutEffect,
  requiredText,
  requiredTextEffect,
} from "../src/index.js";
import type { InvocationOperation } from "../src/index.js";

describe("failure classification", () => {
  test("checks function and declared errors through Effect and adapters", () => {
    const wrapper = { _tag: "FunctionFailure", error: new Error("failed") };
    expect(Effect.runSync(isFunctionFailureEffect(wrapper))).toBe(true);
    expect(isFunctionFailure(wrapper)).toBe(true);
    expect(isFunctionFailure({ _tag: "FunctionFailure" })).toBe(false);

    const declared = Object.assign(new Error("missing"), {
      name: "DeclaredError",
      id: "orders.missing",
      data: {},
      ref: { kind: "error", id: "orders.missing" },
      retry: "never",
    });
    expect(Effect.runSync(isDeclaredErrorEffect(declared))).toBe(true);
    expect(isDeclaredError(declared)).toBe(true);
    expect(isDeclaredError(Object.assign(new Error("missing"), {
      name: "DeclaredError", id: "orders.missing", data: {},
      ref: { kind: "error", id: "orders.missing" }, retry: "soon",
    }))).toBe(false);
    expect(isDeclaredError(Object.assign(new Error("missing"), { ...declared, ref: null }))).toBe(false);
  });

  test("checks provider, dependency, cancellation, and timeout markers", () => {
    const dependency = {
      name: "DependencyNotConfiguredError",
      category: "jobs",
      dependencyName: "publish",
    };
    expect(Effect.runSync(isProviderErrorEffect({ _tag: "ProviderError" }))).toBe(true);
    expect(isProviderError({ name: "ProviderError" })).toBe(true);
    expect(isProviderError({})).toBe(false);
    expect(Effect.runSync(isDependencyNotConfiguredEffect(dependency))).toBe(true);
    expect(isDependencyNotConfigured(dependency)).toBe(true);
    expect(isDependencyNotConfigured({ ...dependency, category: 1 })).toBe(false);
    expect(Effect.runSync(isCancellationEffect({ code: "ABORT_ERR" }))).toBe(true);
    expect(isCancellation(new DOMException("stopped", "AbortError"))).toBe(true);
    expect(isCancellation({})).toBe(false);
    expect(Effect.runSync(isTimeoutEffect(new Cause.TimeoutError()))).toBe(true);
    expect(isTimeout({ code: "ETIMEDOUT" })).toBe(true);
    expect(isTimeout({})).toBe(false);
  });

  test("reports empty required text by tag and preserves TypeError in the adapter", () => {
    expect(Effect.runSync(requiredTextEffect("ready", "field"))).toBe("ready");
    expect(requiredText("ready", "field")).toBe("ready");
    const failure = Effect.runSync(
      Effect.catchTag(requiredTextEffect("  ", "field"), "RequiredTextError", (e) =>
        Effect.succeed(e),
      ),
    );
    expect(failure).toBeInstanceOf(RequiredTextError);
    expect(failure.field).toBe("field");
    expect(() => requiredText("  ", "field")).toThrow(new TypeError("field must be non-empty"));
  });

  test("supports telemetry substitution for every classifier", () => {
    const seen: InvocationOperation[] = [];
    const layer = Layer.succeed(InvocationTelemetry, {
      observe: <A, E, R>(operation: InvocationOperation, effect: Effect.Effect<A, E, R>) => {
        seen.push(operation);
        return effect;
      },
    });
    const operations = Effect.all([
      isFunctionFailureEffect(null),
      isDeclaredErrorEffect(null),
      isProviderErrorEffect(null),
      isDependencyNotConfiguredEffect(null),
      isCancellationEffect(null),
      isTimeoutEffect(null),
      requiredTextEffect("ready", "field"),
    ]);
    Effect.runSync(Effect.provide(operations, layer));
    expect(seen).toEqual([
      "failure.is-function",
      "failure.is-declared",
      "failure.is-provider",
      "failure.is-dependency",
      "failure.is-cancellation",
      "failure.is-timeout",
      "failure.required-text",
    ]);
  });
});
