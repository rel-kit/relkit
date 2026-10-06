import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber } from "effect";
import { ownedNativePromise } from "../../src/services/owned-promise.js";

it.live("a completed resource-producing native call keeps its signal live", () =>
  Effect.gen(function* () {
    let signal: AbortSignal | undefined;
    const value = yield* ownedNativePromise("test.native", (owned) => {
      signal = owned;
      return Promise.resolve({ ready: true });
    });
    expect(value).toEqual({ ready: true });
    expect(signal?.aborted).toBe(false);
  }),
);

it.live("interruption aborts once and waits for the original physical settlement", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const aborted = yield* Deferred.make<void>();
    let finish: (() => void) | undefined;
    let calls = 0;
    let aborts = 0;
    const work = yield* ownedNativePromise("test.native", (signal) => {
      calls += 1;
      signal.addEventListener(
        "abort",
        () => {
          aborts += 1;
          Deferred.doneUnsafe(aborted, Effect.void);
        },
        { once: true },
      );
      Deferred.doneUnsafe(entered, Effect.void);
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    }).pipe(Effect.forkChild);
    yield* Deferred.await(entered);
    const closing = yield* Fiber.interrupt(work).pipe(Effect.forkChild);
    yield* Deferred.await(aborted);
    yield* Effect.yieldNow;
    expect(closing.pollUnsafe()).toBeUndefined();
    expect(calls).toBe(1);
    expect(aborts).toBe(1);
    finish?.();
    yield* Fiber.join(closing);
    expect(Exit.isFailure(yield* Fiber.await(work))).toBe(true);
    expect(calls).toBe(1);
  }),
);
