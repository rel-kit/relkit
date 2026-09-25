import { describe, expect, test } from "vitest";
import { Effect, Layer } from "effect";
import {
  FailureDetailError,
  FailureDetailStore,
  dependencyNotConfiguredFailureEffect,
  makeFailureEffect,
  readFailureDetailEffect,
  readFailureDetail,
  rememberFailure,
  rememberFailureEffect,
} from "../src/index.js";

describe("Effect failure details", () => {
  test("substitutes private detail storage through a Layer", () => {
    const target = {};
    const cause = new Error("private");
    const layer = Layer.succeed(FailureDetailStore, { details: new WeakMap() });
    Effect.runSync(Effect.provide(rememberFailureEffect(target, cause, "fallback"), layer));
    expect(Effect.runSync(Effect.provide(readFailureDetailEffect(target), layer)))
      .toMatchObject({ cause, stack: "fallback" });
    expect(Effect.runSync(readFailureDetailEffect(target))).toBeUndefined();
  });

  test("tags invalid target while preserving the public TypeError", () => {
    const failure = Effect.runSync(Effect.catchTag(
      rememberFailureEffect(null as never, undefined, undefined),
      "FailureDetailError",
      (error) => Effect.succeed(error),
    ));
    expect(failure).toBeInstanceOf(FailureDetailError);
    expect(() => rememberFailure(null as never, undefined, undefined)).toThrow(TypeError);
  });

  test("constructs immutable runtime and dependency failures", () => {
    const cause = new Error("offline");
    const failure = Effect.runSync(makeFailureEffect({
      _tag: "ProviderFailure", kind: "provider", outcome: "provider-failure",
      code: "RELKIT_PROVIDER_FAILURE", message: "Provider failed",
    }, cause));
    expect(Object.isFrozen(failure)).toBe(true);
    expect(Effect.runSync(readFailureDetailEffect(failure))?.cause).toBe(cause);
    expect(readFailureDetail(failure)?.cause).toBe(cause);
    const missing = Effect.runSync(dependencyNotConfiguredFailureEffect({
      category: "cache", dependencyName: "main",
    }));
    expect(missing).toMatchObject({
      code: "RELKIT_DEPENDENCY_NOT_CONFIGURED",
      capability: "cache", profile: "main",
    });
  });
});
