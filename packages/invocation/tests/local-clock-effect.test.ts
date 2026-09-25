import { describe, expect, test, vi } from "vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { createLocalClock, createLocalClockEffect, LocalClockFailure } from "../src/index.js";

describe("local Effect clock", () => {
  test("uses TestClock for now and sleep", async () => {
    const signal = new AbortController().signal;
    const program = Effect.gen(function* () {
      const clock = yield* createLocalClockEffect(signal);
      const now = yield* clock.nowEffect();
      const sleeper = yield* Effect.forkChild(clock.sleepEffect(100));
      yield* TestClock.adjust(100);
      yield* Fiber.join(sleeper);
      return { now, later: yield* clock.nowEffect() };
    });
    const result = await Effect.runPromise(Effect.provide(program, TestClock.layer()));
    expect(result.later.getTime() - result.now.getTime()).toBe(100);
  });

  test("tags invalid duration and preserves RangeError adapter", async () => {
    const clock = createLocalClock(new AbortController().signal, () => 42);
    expect(clock.now().getTime()).toBe(42);
    const failure = Effect.runSync(Effect.catchTag(
      clock.sleepEffect(-1), "LocalClockFailure", (error) => Effect.succeed(error),
    ));
    expect(failure).toBeInstanceOf(LocalClockFailure);
    await expect(clock.sleep(-1)).rejects.toBeInstanceOf(RangeError);
  });

  test("aborts a pending Promise sleep with the original reason", async () => {
    const controller = new AbortController();
    const clock = createLocalClock(controller.signal);
    const pending = clock.sleep(1_000);
    const reason = new Error("cancelled by parent");
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });

  test("removes its listener when abort races with callback registration", async () => {
    const signal = new AbortController().signal;
    const aborted = vi.spyOn(signal, "aborted", "get")
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const add = vi.spyOn(signal, "addEventListener");
    const remove = vi.spyOn(signal, "removeEventListener");
    const clock = createLocalClock(signal);

    await expect(Effect.runPromise(clock.sleepEffect(1_000))).rejects.toBeInstanceOf(LocalClockFailure);
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    aborted.mockRestore();
    add.mockRestore();
    remove.mockRestore();
  });
});
