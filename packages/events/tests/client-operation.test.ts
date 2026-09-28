import { describe, expect, test, vi } from "vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { runAbortable, runAbortableEffect, EventWorkFailed } from "../src/client-operation.js";
import { EventOperationCancelledError, EventOperationTimeoutError } from "../src/client-errors.js";

describe("abortable publication resource", () => {
  test("completes work and releases the listener", async () => {
    const signal = new AbortController().signal;
    const removed = vi.spyOn(signal, "removeEventListener");
    expect(await runAbortable(signal, undefined, async () => 42)).toBe(42);
    expect(removed).toHaveBeenCalledTimes(1);
  });

  test("releases the listener after work failure and preserves the original error", async () => {
    const signal = new AbortController().signal;
    const removed = vi.spyOn(signal, "removeEventListener");
    const error = new Error("provider failed");
    await expect(
      runAbortable(signal, undefined, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(removed).toHaveBeenCalledTimes(1);
    const failure = await Effect.runPromise(
      Effect.flip(
        runAbortableEffect(signal, undefined, async () => {
          throw error;
        }),
      ),
    );
    expect(failure).toBeInstanceOf(EventWorkFailed);
    expect(failure.cause).toBe(error);
  });

  test("does not register or start work for a pre-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const work = vi.fn(async () => 1);
    await expect(runAbortable(controller.signal, undefined, work)).rejects.toBeInstanceOf(
      EventOperationCancelledError,
    );
    expect(add).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  test("rejects an elapsed deadline before registration or work", async () => {
    const signal = new AbortController().signal;
    const add = vi.spyOn(signal, "addEventListener");
    const work = vi.fn(async () => 1);
    await expect(runAbortable(signal, Date.now() - 1, work)).rejects.toBeInstanceOf(
      EventOperationTimeoutError,
    );
    expect(add).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  test("handles synchronous abort during registration without starting late", async () => {
    const controller = new AbortController();
    const signal = controller.signal;
    const original = signal.addEventListener.bind(signal);
    const removed = vi.spyOn(signal, "removeEventListener");
    vi.spyOn(signal, "addEventListener").mockImplementation((...args) => {
      original(...args);
      controller.abort();
    });
    const work = vi.fn(async () => 1);
    await expect(runAbortable(signal, undefined, work)).rejects.toBeInstanceOf(
      EventOperationCancelledError,
    );
    expect(work).not.toHaveBeenCalled();
    expect(removed).toHaveBeenCalledTimes(1);
  });

  test("releases partial registration when acquisition fails", async () => {
    const signal = new AbortController().signal;
    const original = signal.addEventListener.bind(signal);
    const removed = vi.spyOn(signal, "removeEventListener");
    const failure = new Error("registration failed");
    vi.spyOn(signal, "addEventListener").mockImplementation((...args) => {
      original(...args);
      throw failure;
    });
    const work = vi.fn(async () => 1);
    await expect(runAbortable(signal, undefined, work)).rejects.toBe(failure);
    expect(removed).toHaveBeenCalledTimes(1);
    expect(work).not.toHaveBeenCalled();
  });

  test("releases the listener on cancellation while work is pending", async () => {
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    let resolveWork: (value: number) => void = () => {};
    const pending = new Promise<number>((resolve) => {
      resolveWork = resolve;
    });
    const operation = runAbortable(controller.signal, undefined, () => pending);
    await Promise.resolve();
    controller.abort();
    await expect(operation).rejects.toBeInstanceOf(EventOperationCancelledError);
    expect(removed).toHaveBeenCalledTimes(1);
    resolveWork(2);
  });

  test("releases the listener when a pending operation reaches its deadline", async () => {
    const signal = new AbortController().signal;
    const removed = vi.spyOn(signal, "removeEventListener");
    let started = 0;
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          runAbortableEffect(signal, 100, () => {
            started++;
            return new Promise<number>(() => {});
          }),
        );
        yield* Effect.yieldNow;
        yield* TestClock.adjust(101);
        return yield* Effect.flip(Fiber.join(fiber));
      }).pipe(Effect.provide(TestClock.layer())),
    );
    expect(failure).toBeInstanceOf(EventOperationTimeoutError);
    expect(started).toBe(1);
    expect(removed).toHaveBeenCalledTimes(1);
  });

  test("releases on Effect interruption", async () => {
    const signal = new AbortController().signal;
    const removed = vi.spyOn(signal, "removeEventListener");
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkScoped(
            runAbortableEffect(signal, undefined, () => new Promise<number>(() => {})),
            { startImmediately: true },
          );
          yield* Fiber.interrupt(fiber);
        }),
      ),
    );
    expect(removed).toHaveBeenCalledTimes(1);
  });
});
