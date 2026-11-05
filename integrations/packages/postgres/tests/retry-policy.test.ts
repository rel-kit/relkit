/** Pure retry decisions of the Postgres jobs backend for task-style and millisecond policies. */
import { expect, test } from "bun:test";
import { failureOf, maxAttempts, retryDelay } from "../src/runtime/jobs-retry-policy.js";

const later = { code: "SMTP_DOWN", message: "later" };

test("reads a normalized task policy with durations and a factor", () => {
  const policy = {
    retry: {
      maxAttempts: 4,
      initialDelay: "1 second",
      maxDelay: "3 seconds",
      factor: 2,
      jitter: "none",
    },
  };
  expect(maxAttempts(policy)).toBe(4);
  expect([1, 2, 3].map((attempt) => retryDelay(policy, attempt, later))).toEqual([
    1_000, 2_000, 3_000,
  ]);
  expect(retryDelay(policy, 4, later)).toBeUndefined();
});

test("honors retry hints and the absence of a policy", () => {
  const policy = { retry: { maxAttempts: 3, initialDelayMs: 10 } };
  expect(retryDelay(policy, 1, { ...later, retry: "never" })).toBeUndefined();
  expect(retryDelay(policy, 1, { ...later, afterMs: 500 })).toBe(500);
  expect(retryDelay(undefined, 1, later)).toBeUndefined();
  expect(maxAttempts(undefined)).toBe(1);
  expect(
    retryDelay(
      { retry: { maxAttempts: 3, initialDelayMs: 100, jitter: "full" } },
      1,
      later,
      () => 0.5,
    ),
  ).toBe(50);
});

test("keeps only safe failure fields", () => {
  expect(failureOf(new TypeError("bad"))).toEqual({ code: "TypeError", message: "bad" });
  expect(failureOf({ code: "X", message: "m", retry: "later", secret: "s" })).toEqual({
    code: "X",
    message: "m",
    retry: "later",
  });
});
