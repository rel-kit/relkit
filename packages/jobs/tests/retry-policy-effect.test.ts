import { expect, test } from "vitest";
import { Effect, Result } from "effect";
import {
  RetryPolicyValidationError,
  validateRetry,
  validateRetryEffect,
} from "../src/retry-policy.ts";

const policy = {
  maxAttempts: 2,
  initialDelayMs: 0,
  maxDelayMs: 1_000,
  multiplier: 2,
  jitter: "none",
} as const;

test("Effect validation returns a frozen copy", async () => {
  const result = await Effect.runPromise(validateRetryEffect(policy));
  expect(result).toEqual(policy);
  expect(result).not.toBe(policy);
  expect(Object.isFrozen(result)).toBe(true);
  expect(validateRetry(policy)).toEqual(result);
});

test("invalid policy fails with a tagged error and the adapter throws TypeError", async () => {
  const invalid = { ...policy, maxAttempts: 0 };
  const result = await Effect.runPromise(Effect.result(validateRetryEffect(invalid)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(RetryPolicyValidationError);
    expect(result.failure._tag).toBe("Jobs.RetryPolicyValidationError");
    expect(result.failure.reason).toContain("positive integer");
  }
  expect(() => validateRetry(invalid)).toThrow(TypeError);
  expect(() => validateRetry({ ...policy, maxDelayMs: -1 })).toThrow("non-negative");
  expect(() => validateRetry({ ...policy, maxDelayMs: 0, initialDelayMs: 1 })).toThrow("at least");
});
