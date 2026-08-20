import { Cause, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, test } from "bun:test";
import { createPublicClock } from "./src/clock.js";
import { composeDeadline, withDeadline, withTimeout } from "./src/deadline.js";
import { invokeUserHandler } from "./src/handler-bridge.js";
import { normalizeFailure } from "./src/failure.js";

describe("runtime deadline composition", () => {
  test("chooses the earliest parent or child deadline", () => {
    expect(composeDeadline(2_000, 500, 1_000)).toBe(1_500);
    expect(composeDeadline(1_100, 500, 1_000)).toBe(1_100);
    expect(composeDeadline(undefined, 500, 1_000)).toBe(1_500);
  });

  test("child timeout inherits the earlier deadline on the Effect clock", async () => {
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(withDeadline(withTimeout(Effect.never, 1_000), 100));
      yield* TestClock.adjust(100);
      return yield* Fiber.await(fiber);
    });
    const exit = await Effect.runPromise(Effect.provide(program, TestClock.layer()));

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(
        exit.cause.reasons.some(
          (reason) => Cause.isFailReason(reason) && Cause.isTimeoutError(reason.error),
        ),
      ).toBe(true);
    }
  });

  test("handler timeout aborts the public signal and returns a timeout failure", async () => {
    let aborted = false;
    const program = Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        invokeUserHandler({
          input: undefined,
          publicContext: { signal: new AbortController().signal },
          timeoutMs: 100,
          handler: (_input, _request, context) =>
            new Promise<void>(() => {
              context.signal.addEventListener("abort", () => {
                aborted = true;
              });
            }),
        }),
      );
      yield* Effect.yieldNow;
      yield* TestClock.adjust(100);
      return yield* Fiber.await(fiber);
    });
    const exit = await Effect.runPromise(Effect.provide(program, TestClock.layer()));

    expect(aborted).toBe(true);
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const reason = exit.cause.reasons.find(Cause.isFailReason);
      expect(reason).toBeDefined();
      if (reason !== undefined) expect(normalizeFailure(reason.error).kind).toBe("timeout");
    }
  });
});

describe("public Effect clock", () => {
  test("now and sleep use a controllable clock without real sleeps", async () => {
    const effectClock = await Effect.runPromise(Effect.scoped(TestClock.make()));
    const clock = createPublicClock(effectClock, {
      run: (effect, options) => Effect.runPromise(effect, options),
    });
    let completed = false;
    const pending = clock.sleep(500).then(() => {
      completed = true;
    });

    await Promise.resolve();
    expect(completed).toBe(false);
    expect(clock.now().getTime()).toBe(0);
    await Effect.runPromise(effectClock.adjust(500));
    await pending;

    expect(completed).toBe(true);
    expect(clock.now().getTime()).toBe(500);
  });
});
