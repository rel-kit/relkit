import { Effect, Fiber, Result } from "effect";
import { TestClock } from "effect/testing";
import { expect, test } from "vitest";
import { JobClientAbortFailure, runAbortable, runAbortableEffect } from "../src/client-abort.ts";
import { JobOperationCancelledError, JobOperationTimeoutError } from "../src/client.ts";
test("Effect releases the listener after success and preserves the Promise result", async () => {
  const controller = new AbortController();
  let removes = 0;
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.removeEventListener = ((...args) => {
    removes++;
    remove(...args);
  }) as typeof remove;
  expect(
    await Effect.runPromise(runAbortableEffect(controller.signal, undefined, async () => "ok")),
  ).toBe("ok");
  expect(removes).toBe(1);
  expect(await runAbortable(new AbortController().signal, undefined, async () => "sync")).toBe(
    "sync",
  );
});
test("pre-abort, registration abort, and expired deadline never start work", async () => {
  let starts = 0;
  const work = async () => {
    starts++;
    return "late";
  };
  const controller = new AbortController();
  controller.abort();
  const pre = await Effect.runPromise(
    Effect.result(runAbortableEffect(controller.signal, undefined, work)),
  );
  expect(Result.isFailure(pre)).toBe(true);
  if (Result.isFailure(pre)) expect(pre.failure.cause).toBeInstanceOf(JobOperationCancelledError);
  const signal = {
    aborted: false,
    addEventListener(_event: string, listener: EventListener) {
      this.aborted = true;
      listener(new Event("abort"));
    },
    removeEventListener() {},
  } as unknown as AbortSignal;
  const during = await Effect.runPromise(
    Effect.result(runAbortableEffect(signal, undefined, work)),
  );
  expect(Result.isFailure(during)).toBe(true);
  const expired = await Effect.runPromise(
    Effect.result(runAbortableEffect(new AbortController().signal, Date.now() - 1, work)),
  );
  expect(Result.isFailure(expired)).toBe(true);
  if (Result.isFailure(expired))
    expect(expired.failure.cause).toBeInstanceOf(JobOperationTimeoutError);
  expect(starts).toBe(0);
});
test("provider failure and partial registration preserve the original cause", async () => {
  const original = new Error("provider failed");
  await expect(
    runAbortable(new AbortController().signal, undefined, async () => {
      throw original;
    }),
  ).rejects.toBe(original);
  let removes = 0;
  const signal = {
    aborted: false,
    addEventListener() {
      throw new Error("register failed");
    },
    removeEventListener() {
      removes++;
    },
  } as unknown as AbortSignal;
  const result = await Effect.runPromise(
    Effect.result(runAbortableEffect(signal, undefined, async () => "never")),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(JobClientAbortFailure);
  expect(removes).toBe(1);
});
test("interruption releases the listener", async () => {
  const controller = new AbortController();
  let removes = 0;
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.removeEventListener = ((...args) => {
    removes++;
    remove(...args);
  }) as typeof remove;
  let started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const fiber = Effect.runFork(
    runAbortableEffect(controller.signal, undefined, async () => {
      started();
      return new Promise<string>(() => undefined);
    }),
  );
  await began;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(removes).toBe(1);
});
test("client deadline uses the supplied Effect clock", async () => {
  const success = await Effect.runPromise(
    Effect.provide(
      runAbortableEffect(new AbortController().signal, 1000, async () => "ok"),
      TestClock.layer(),
    ),
  );
  expect(success).toBe("ok");
  let started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  let providerSignal: AbortSignal | undefined;
  const result = await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Effect.result(
            runAbortableEffect(new AbortController().signal, 1000, (signal) => {
              providerSignal = signal;
              started();
              return new Promise<string>(() => undefined);
            }),
          ),
        );
        yield* Effect.promise(() => began);
        yield* TestClock.adjust("1 second");
        return yield* Fiber.join(fiber);
      }),
      TestClock.layer(),
    ),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result))
    expect(result.failure.cause).toBeInstanceOf(JobOperationTimeoutError);
  expect(providerSignal?.aborted).toBe(true);
});
