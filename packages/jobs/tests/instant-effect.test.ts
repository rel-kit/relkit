import { expect, test } from "vitest";
import { Effect, Result } from "effect";
import {
  assertRfc3339Instant,
  assertRfc3339InstantEffect,
  InstantValidationError,
  isRfc3339Instant,
  isRfc3339InstantEffect,
} from "../src/instant-validation.ts";

test("Effect predicate checks leap days, offsets, and malformed dates", async () => {
  expect(await Effect.runPromise(isRfc3339InstantEffect("2024-02-29T23:59:59Z"))).toBe(true);
  expect(await Effect.runPromise(isRfc3339InstantEffect("2025-02-29T23:59:59Z"))).toBe(false);
  expect(await Effect.runPromise(isRfc3339InstantEffect("2026-01-01T00:00:00+24:00"))).toBe(false);
  expect(await Effect.runPromise(isRfc3339InstantEffect("2026-01-01T00:00:00+02:30"))).toBe(true);
  expect(await Effect.runPromise(isRfc3339InstantEffect(null))).toBe(false);
});

test("Effect assertion exposes a tagged error and sync adapter keeps TypeError", async () => {
  const result = await Effect.runPromise(
    Effect.result(assertRfc3339InstantEffect("invalid", "scheduledFor")),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(InstantValidationError);
    expect(result.failure._tag).toBe("Jobs.InstantValidationError");
    expect(result.failure.name).toBe("scheduledFor");
  }
  expect(isRfc3339Instant("2026-01-01T00:00:00Z")).toBe(true);
  expect(() => assertRfc3339Instant("invalid", "scheduledFor")).toThrow(
    "scheduledFor must be a valid RFC 3339 instant",
  );
});
