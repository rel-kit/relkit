import { expect, test, vi } from "vitest";
import { Effect, Fiber, Metric, Result } from "effect";
import { JobControlUnknownError } from "../src/control-errors.ts";
import { controlWrite, controlWriteEffect, JobControlWriteFailure } from "../src/control-write.ts";

test("success and provider failure release the abort listener", async () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  expect(
    await Effect.runPromise(
      controlWriteEffect(() => Promise.resolve("ok"), controller.signal, "op"),
    ),
  ).toBe("ok");
  expect(remove).toHaveBeenCalledTimes(1);
  const providerError = new Error("provider failed");
  await expect(
    controlWrite(() => Promise.reject(providerError), controller.signal, "op"),
  ).rejects.toBe(providerError);
  expect(remove).toHaveBeenCalledTimes(2);
  remove.mockRestore();
});

test("pre-aborted signals prevent provider start and preserve their reason", async () => {
  const controller = new AbortController();
  const reason = new Error("cancelled");
  controller.abort(reason);
  let starts = 0;
  const result = await Effect.runPromise(
    Effect.result(
      controlWriteEffect(
        () => {
          starts++;
          return Promise.resolve("late");
        },
        controller.signal,
        "op",
      ),
    ),
  );
  expect(starts).toBe(0);
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(JobControlWriteFailure);
    expect(result.failure.kind).toBe("cancelled");
    expect(result.failure.cause).toBe(reason);
  }
});

test("abort after provider start reports an unknown outcome and releases", async () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  let started!: () => void;
  const begun = new Promise<void>((resolve) => {
    started = resolve;
  });
  const result = Effect.runPromise(
    Effect.result(
      controlWriteEffect(
        () => {
          started();
          return new Promise<string>(() => undefined);
        },
        controller.signal,
        "op",
      ),
    ),
  );
  await begun;
  controller.abort();
  const settled = await result;
  expect(Result.isFailure(settled)).toBe(true);
  if (Result.isFailure(settled)) {
    expect(settled.failure.kind).toBe("unknown");
    expect(settled.failure.cause).toBeInstanceOf(JobControlUnknownError);
  }
  expect(remove).toHaveBeenCalledTimes(1);
  remove.mockRestore();
});

test("synchronous abort and partial registration failure clean up without starting", async () => {
  const controller = new AbortController();
  const originalAdd = controller.signal.addEventListener.bind(controller.signal);
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  const add = vi.spyOn(controller.signal, "addEventListener").mockImplementation((...args) => {
    originalAdd(...args);
    controller.abort();
  });
  let starts = 0;
  const synchronous = await Effect.runPromise(
    Effect.result(
      controlWriteEffect(
        () => {
          starts++;
          return Promise.resolve("late");
        },
        controller.signal,
        "op",
      ),
    ),
  );
  expect(Result.isFailure(synchronous)).toBe(true);
  expect(starts).toBe(0);
  expect(remove).toHaveBeenCalledTimes(1);
  add.mockRestore();
  remove.mockRestore();

  const partial = new AbortController();
  const partialAdd = partial.signal.addEventListener.bind(partial.signal);
  const partialRemove = vi.spyOn(partial.signal, "removeEventListener");
  const partialSpy = vi.spyOn(partial.signal, "addEventListener").mockImplementation((...args) => {
    partialAdd(...args);
    throw new Error("registration failed");
  });
  const result = await Effect.runPromise(
    Effect.result(controlWriteEffect(() => Promise.resolve("late"), partial.signal, "op")),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure.kind).toBe("register");
  expect(partialRemove).toHaveBeenCalledTimes(1);
  partialSpy.mockRestore();
  partialRemove.mockRestore();
});

test("interruption releases the listener and records bounded metrics", async () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  let started!: () => void;
  const begun = new Promise<void>((resolve) => {
    started = resolve;
  });
  const fiber = Effect.runFork(
    controlWriteEffect(
      () => {
        started();
        return new Promise<string>(() => undefined);
      },
      controller.signal,
      "op",
    ),
  );
  await begun;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(remove).toHaveBeenCalledTimes(1);
  remove.mockRestore();

  const calls = Metric.counter("relkit_jobs_operations_total", { incremental: true });
  const count = await Effect.runPromise(
    Effect.provideService(
      Effect.gen(function* () {
        yield* controlWriteEffect(() => Promise.resolve("ok"), undefined, "metric-op");
        return (yield* Metric.value(Metric.withAttributes(calls, { operation: "control.write" })))
          .count;
      }),
      Metric.MetricRegistry,
      new Map(),
    ),
  );
  expect(count).toBe(1);
});
