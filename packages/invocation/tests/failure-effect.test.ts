import { describe, expect, test } from "vitest";
import { Cause, Effect } from "effect";
import {
  FailureNormalizationError,
  RequiredTextError,
  applicationFailure,
  applicationFailureEffect,
  cancellationFailureEffect,
  isInvocationFailureEffect,
  isInvocationFailure,
  normalizeFailure,
  normalizeFailureEffect,
  providerFailureEffect,
  timeoutFailureEffect,
  timeoutFailure,
  toPublicEnvelopeEffect,
  toPublicEnvelope,
  unexpectedDefectEffect,
} from "../src/index.js";

describe("Effect failure construction and normalization", () => {
  test("builds each stable failure kind", () => {
    const application = Effect.runSync(applicationFailureEffect({
      id: "errors.duplicate", message: "Duplicate", data: { key: 1 }, retry: "never",
    }));
    expect(application).toMatchObject({ _tag: "ApplicationFailure", retry: "never" });
    expect(Effect.runSync(providerFailureEffect(new Error("offline"))).kind).toBe("provider");
    expect(Effect.runSync(cancellationFailureEffect()).kind).toBe("cancellation");
    expect(Effect.runSync(timeoutFailureEffect()).kind).toBe("timeout");
    expect(timeoutFailure().kind).toBe("timeout");
    expect(Effect.runSync(unexpectedDefectEffect()).kind).toBe("defect");
    expect(Effect.runSync(isInvocationFailureEffect(application))).toBe(true);
    expect(isInvocationFailure(application)).toBe(true);
  });

  test("tags malformed factory input and preserves the public TypeError", () => {
    const options = { id: "", message: "Duplicate", data: null };
    const failure = Effect.runSync(Effect.catchTag(
      applicationFailureEffect(options), "RequiredTextError", (error) => Effect.succeed(error),
    ));
    expect(failure).toBeInstanceOf(RequiredTextError);
    expect(() => applicationFailure(options)).toThrow(TypeError);
  });

  test("normalizes Effect Cause and creates a redacted public envelope", () => {
    const cause = Cause.fail(new Error("private"));
    const failure = Effect.runSync(normalizeFailureEffect(cause, { source: "provider" }));
    expect(failure).toMatchObject({ _tag: "ProviderFailure", code: "RELKIT_PROVIDER_FAILURE" });
    expect(Effect.runSync(toPublicEnvelopeEffect(failure))).toEqual({
      kind: "provider", outcome: "provider-failure", code: "RELKIT_PROVIDER_FAILURE",
      message: "Provider operation failed",
    });
  });

  test("includes safe declared data and optional retry fields only when present", () => {
    const declared = applicationFailure({
      id: "errors.retry", message: "Retry later", data: { safe: true },
      retry: "later", afterMs: 25, status: 429,
    });
    expect(toPublicEnvelope(declared)).toMatchObject({
      data: { safe: true }, retry: "later", afterMs: 25, status: 429,
    });
    const unsafe = applicationFailure({
      id: "errors.unsafe", message: "Unsafe", data: new Error("private"),
    });
    expect(toPublicEnvelope(unsafe)).not.toHaveProperty("data");
    expect(toPublicEnvelope(unsafe)).not.toHaveProperty("status");
    expect(toPublicEnvelope(unsafe)).not.toHaveProperty("afterMs");
  });

  test("tags malformed declared metadata while public adapter keeps TypeError", () => {
    const declared = Object.assign(new Error("Duplicate"), {
      name: "DeclaredError",
      id: "",
      ref: { kind: "error", id: "" },
      data: null,
    });
    const failure = Effect.runSync(Effect.catchTag(
      normalizeFailureEffect(declared), "FailureNormalizationError",
      (error) => Effect.succeed(error),
    ));
    expect(failure).toBeInstanceOf(FailureNormalizationError);
    expect(() => normalizeFailure(declared)).toThrow(TypeError);
    expect(() => toPublicEnvelope(declared)).toThrow(TypeError);
  });
});
