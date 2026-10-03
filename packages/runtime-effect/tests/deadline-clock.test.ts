import { Cause, Clock, Effect, Fiber } from "effect";
import { it } from "@effect/vitest";
import { TestClock } from "effect/testing";
import { describe, expect, test } from "vitest";
import { createPublicClock } from "../src/clock.js";
import { composeDeadline, withDeadline, withTimeout } from "../src/deadline.js";
import { invokeUserHandler } from "../src/handler-bridge.js";
import { normalizeFailure } from "../src/failure.js";

describe("runtime deadline composition", () => {
  test("chooses the earliest parent or child deadline", () => {
    expect(composeDeadline(2_000, 500, 1_000)).toBe(1_500);
    expect(composeDeadline(1_100, 500, 1_000)).toBe(1_100);
    expect(composeDeadline(undefined, 500, 1_000)).toBe(1_500);
  });

  it.effect("child timeout inherits the earlier deadline on the Effect clock", () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(withDeadline(withTimeout(Effect.never, 1_000), 100));
      yield* TestClock.adjust(100);
      const exit = yield* Fiber.await(fiber);
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        expect(
          exit.cause.reasons.some(
            (reason) => Cause.isFailReason(reason) && Cause.isTimeoutError(reason.error),
          ),
        ).toBe(true);
      }
    }),
  );

  it.effect("handler timeout aborts the public signal and returns a timeout failure", () =>
    Effect.gen(function* () {
      let aborted = false;
      const fiber = yield* Effect.forkChild(
        invokeUserHandler({
          input: undefined,
          publicContext: { signal: new AbortController().signal },
          timeoutMs: 100,
          handler: (_input, context) =>
            new Promise<void>(() => {
              context.signal.addEventListener("abort", () => {
                aborted = true;
              });
            }),
        }),
      );
      yield* Effect.yieldNow;
      yield* TestClock.adjust(100);
      const exit = yield* Fiber.await(fiber);
      expect(aborted).toBe(true);
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        const reason = exit.cause.reasons.find(Cause.isFailReason);
        expect(reason).toBeDefined();
        if (reason !== undefined) expect(normalizeFailure(reason.error).kind).toBe("timeout");
      }
    }),
  );
});

describe("public Effect clock", () => {
  it.effect("now and sleep use a controllable clock without real sleeps", () =>
    Effect.gen(function* () {
      const effectClock = yield* Clock.Clock;
      const clock = createPublicClock(effectClock, {
        run: (effect, options) => Effect.runPromise(effect, options),
      });
      const pending = yield* Effect.forkChild(Effect.promise(() => clock.sleep(500)));
      yield* Effect.yieldNow;
      expect(pending.pollUnsafe()).toBeUndefined();
      expect(clock.now().getTime()).toBe(0);
      yield* TestClock.adjust(500);
      yield* Fiber.join(pending);
      expect(clock.now().getTime()).toBe(500);
    }),
  );
});
