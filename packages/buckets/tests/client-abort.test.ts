import { describe, expect, test, vi } from "vitest";
import { Effect, Exit, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { runAbortableEffect } from "../src/client-abort.js";
import {
  BucketOperationCancelledError,
  BucketOperationTimeoutError,
} from "../src/client-errors.js";

describe("bucket cancellation scope", () => {
  test("does not start work after an already aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    let started = false;
    const failure = await Effect.runPromise(
      Effect.flip(
        runAbortableEffect(
          controller.signal,
          undefined,
          Effect.sync(() => {
            started = true;
          }),
        ),
      ),
    );
    expect(failure).toBeInstanceOf(BucketOperationCancelledError);
    expect(started).toBe(false);
  });

  test("releases the listener after success and provider failure", async () => {
    for (const [success, work] of [
      [true, Effect.succeed(1)] as const,
      [false, Effect.fail(new Error("provider"))] as const,
    ]) {
      const signal = new AbortController().signal;
      const remove = vi.spyOn(signal, "removeEventListener");
      const exit = await Effect.runPromiseExit(runAbortableEffect(signal, undefined, work));
      expect(Exit.isSuccess(exit)).toBe(success);
      expect(remove).toHaveBeenCalledTimes(1);
    }
  });

  test("releases on cancellation while provider work is pending", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const work = Effect.flatMap(Effect.sync(started), () => Effect.never);
    const running = Effect.runPromise(
      Effect.flip(runAbortableEffect(controller.signal, undefined, work)),
    );
    await ready;
    controller.abort();
    expect(await running).toBeInstanceOf(BucketOperationCancelledError);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test("releases the listener when the Effect fiber is interrupted", async () => {
    const signal = new AbortController().signal;
    let registered!: () => void;
    const ready = new Promise<void>((resolve) => {
      registered = resolve;
    });
    const add = signal.addEventListener.bind(signal);
    vi.spyOn(signal, "addEventListener").mockImplementation((type, callback, options) => {
      add(type, callback, options);
      registered();
    });
    const remove = vi.spyOn(signal, "removeEventListener");
    const fiber = Effect.runFork(runAbortableEffect(signal, undefined, Effect.never));
    await ready;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test("uses TestClock for deadlines and releases on timeout", async () => {
    const signal = new AbortController().signal;
    const remove = vi.spyOn(signal, "removeEventListener");
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(runAbortableEffect(signal, 100, Effect.never));
          yield* TestClock.adjust(100);
          return yield* Effect.flip(Fiber.join(fiber));
        }),
        TestClock.layer(),
      ),
    );
    expect(result).toBeInstanceOf(BucketOperationTimeoutError);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test("cleans a listener when registration invokes cancellation synchronously", async () => {
    const signal = new AbortController().signal;
    const add = signal.addEventListener.bind(signal);
    const remove = vi.spyOn(signal, "removeEventListener");
    vi.spyOn(signal, "addEventListener").mockImplementation((type, callback, options) => {
      add(type, callback, options);
      if (type === "abort" && typeof callback === "function") callback(new Event("abort"));
    });
    const failure = await Effect.runPromise(
      Effect.flip(runAbortableEffect(signal, undefined, Effect.never)),
    );
    expect(failure).toBeInstanceOf(BucketOperationCancelledError);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test("cleans partial registration failures", async () => {
    const signal = new AbortController().signal;
    const add = signal.addEventListener.bind(signal);
    const remove = vi.spyOn(signal, "removeEventListener");
    vi.spyOn(signal, "addEventListener").mockImplementation((type, callback, options) => {
      add(type, callback, options);
      throw new Error("registration failed");
    });
    const exit = await Effect.runPromiseExit(runAbortableEffect(signal, undefined, Effect.never));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
