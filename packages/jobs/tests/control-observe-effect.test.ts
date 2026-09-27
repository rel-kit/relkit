import { expect, test, vi } from "vitest";
import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import { Effect, Fiber, Result, Stream } from "effect";
import { TestClock } from "effect/testing";
import {
  JobObserveFailure,
  observeWithTimeout,
  observeWithTimeoutEffect,
} from "../src/control-observe.ts";
type Frame = RunWatchFrame<RunSnapshot>;
const frame = { kind: "snapshot" } as Frame;
function source(
  next: () => Promise<IteratorResult<Frame>>,
  returned: () => void,
): AsyncIterable<Frame> {
  return {
    [Symbol.asyncIterator]: () => ({
      next,
      return: async () => {
        returned();
        return { done: true, value: undefined };
      },
    }),
  };
}
test("observation compatibility iterable closes native observation after early return", async () => {
  let closed = 0;
  let reads = 0;
  const iterable = observeWithTimeout(
    source(
      async () => {
        reads += 1;
        return { done: false, value: frame };
      },
      () => {
        closed += 1;
      },
    ),
    new AbortController().signal,
    1000,
  );
  for await (const value of iterable) {
    expect(value).toBe(frame);
    break;
  }
  expect(reads).toBe(1);
  expect(closed).toBe(1);
});
test("observation stream times out on TestClock and closes native observation", async () => {
  let closed = 0;
  const stream = Effect.runSync(
    observeWithTimeoutEffect(
      source(
        () => new Promise<IteratorResult<Frame>>(() => undefined),
        () => {
          closed += 1;
        },
      ),
      new AbortController().signal,
      100,
    ),
  );
  const result = await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(Effect.result(Stream.runCollect(stream)));
        yield* TestClock.adjust("100 millis");
        return yield* Fiber.join(fiber);
      }),
      TestClock.layer(),
    ),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(JobObserveFailure);
  expect(closed).toBe(1);
});
test("observation aborts a pending read and closes native observation", async () => {
  const controller = new AbortController();
  let closed = 0;
  let started!: () => void;
  const begun = new Promise<void>((resolve) => {
    started = resolve;
  });
  const stream = Effect.runSync(
    observeWithTimeoutEffect(
      source(
        () => {
          started();
          return new Promise<IteratorResult<Frame>>(() => undefined);
        },
        () => {
          closed += 1;
        },
      ),
      controller.signal,
      1000,
    ),
  );
  const execution = Effect.runPromise(Effect.result(Stream.runCollect(stream)));
  await begun;
  controller.abort(new Error("cancelled"));
  const result = await execution;
  expect(Result.isFailure(result)).toBe(true);
  expect(closed).toBe(1);
});
test("observation cleans partial registration and does not start a cancelled read", async () => {
  const controller = new AbortController();
  const removed = vi.spyOn(controller.signal, "removeEventListener");
  vi.spyOn(controller.signal, "addEventListener").mockImplementation(() => {
    throw new Error("registration failed");
  });
  let reads = 0;
  let closed = 0;
  const stream = Effect.runSync(
    observeWithTimeoutEffect(
      source(
        async () => {
          reads += 1;
          return { done: false, value: frame };
        },
        () => {
          closed += 1;
        },
      ),
      controller.signal,
      1000,
    ),
  );
  const result = await Effect.runPromise(Effect.result(Stream.runCollect(stream)));
  expect(Result.isFailure(result)).toBe(true);
  expect(reads).toBe(0);
  expect(closed).toBe(1);
  expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
});
test("observation handles cancellation during listener registration without starting a read", async () => {
  const controller = new AbortController();
  const add = controller.signal.addEventListener.bind(controller.signal);
  vi.spyOn(controller.signal, "addEventListener").mockImplementation((type, listener, options) => {
    add(type, listener, options);
    controller.abort(new Error("cancelled during registration"));
  });
  let reads = 0;
  let closed = 0;
  const stream = Effect.runSync(
    observeWithTimeoutEffect(
      source(
        async () => {
          reads += 1;
          return { done: false, value: frame };
        },
        () => {
          closed += 1;
        },
      ),
      controller.signal,
      1000,
    ),
  );
  const result = await Effect.runPromise(Effect.result(Stream.runCollect(stream)));
  expect(Result.isFailure(result)).toBe(true);
  expect(reads).toBe(0);
  expect(closed).toBe(1);
});
test("observation iterator closes its native source once after repeated disposal", async () => {
  let closed = 0;
  const iterator = observeWithTimeout(
    source(
      async () => ({ done: false, value: frame }),
      () => {
        closed += 1;
      },
    ),
    new AbortController().signal,
    1000,
  )[Symbol.asyncIterator]();
  expect((await iterator.next()).done).toBe(false);
  await iterator.return?.();
  await iterator.return?.();
  expect(closed).toBe(1);
});
