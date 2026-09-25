import { describe, expect, test } from "vitest";
import { Cause, Effect, Fiber, Layer } from "effect";
import { TestClock } from "effect/testing";
import {
  DeadlineValidationError,
  InvocationTelemetry,
  composeDeadline,
  composeDeadlineEffect,
  withDeadline,
  withTimeout,
} from "../src/index.js";
import type { InvocationOperation } from "../src/index.js";

describe("invocation deadlines", () => {
  test("chooses the earliest valid deadline through Effect and the adapter", () => {
    for (const [parent, timeout, now, expected] of [
      [undefined, undefined, 1_000, undefined],
      [2_000, 500, 1_000, 1_500],
      [1_100, 500, 1_000, 1_100],
      [undefined, 500, 1_000, 1_500],
    ] as const) {
      expect(Effect.runSync(composeDeadlineEffect(parent, timeout, now))).toBe(expected);
      expect(composeDeadline(parent, timeout, now)).toBe(expected);
    }
  });

  test("reports invalid inputs by tag and preserves RangeError in the adapter", () => {
    for (const [parent, timeout, now, field] of [
      [undefined, undefined, Infinity, "now"],
      [Infinity, undefined, 0, "deadline"],
      [undefined, -1, 0, "timeoutMs"],
      [undefined, Infinity, 0, "timeoutMs"],
      [undefined, Number.MAX_VALUE, Number.MAX_VALUE, "timeoutMs"],
    ] as const) {
      const error = Effect.runSync(
        Effect.catchTag(composeDeadlineEffect(parent, timeout, now), "DeadlineValidationError", (e) =>
          Effect.succeed(e),
        ),
      );
      expect(error).toBeInstanceOf(DeadlineValidationError);
      expect(error.field).toBe(field);
      expect(() => composeDeadline(parent, timeout, now)).toThrow(RangeError);
    }
  });

  test("uses the Effect clock for inherited timeouts and interruption", async () => {
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(withDeadline(withTimeout(Effect.never, 1_000), 100));
      yield* TestClock.adjust(100);
      return yield* Fiber.await(fiber);
    });
    const exit = await Effect.runPromise(Effect.provide(program, TestClock.layer()));
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure")
      expect(
        exit.cause.reasons.some(
          (reason) => Cause.isFailReason(reason) && Cause.isTimeoutError(reason.error),
        ),
      ).toBe(true);
  });

  test("reports invalid absolute deadlines inside Effect", () => {
    const field = Effect.runSync(
      Effect.catchTag(withDeadline(Effect.succeed(1), NaN), "DeadlineValidationError", (e) =>
        Effect.succeed(e.field),
      ),
    );
    expect(field).toBe("deadline");
    expect(Effect.runSync(withDeadline(Effect.succeed(1), undefined))).toBe(1);
  });

  test("allows telemetry substitution for deadline calculations", () => {
    const seen: InvocationOperation[] = [];
    const layer = Layer.succeed(InvocationTelemetry, {
      observe: <A, E, R>(operation: InvocationOperation, effect: Effect.Effect<A, E, R>) => {
        seen.push(operation);
        return effect;
      },
    });
    Effect.runSync(Effect.provide(composeDeadlineEffect(undefined, 1, 0), layer));
    Effect.runSync(Effect.provide(withTimeout(Effect.succeed(1), 10), layer));
    expect(seen).toEqual([
      "deadline.compose",
      "deadline.timeout",
      "deadline.compose",
      "deadline.with",
    ]);
  });
});
