import { expect, test, vi } from "vitest";
import type { RunSnapshot } from "@relkit/contracts/jobs";
import { Effect, Fiber, Layer, Result } from "effect";
import { TestClock } from "effect/testing";
import { JobResultUnavailableError } from "../src/control-errors.ts";
import {
  JobResultFailure,
  resultRunReaderLayer,
  waitForResultEffect,
} from "../src/control-result.ts";
import type { JobsRuntime } from "../src/runtime.ts";
const runtime = {} as JobsRuntime;
const completed = {
  accepted: true,
  runId: "run-1",
  jobId: "job-1",
  taskId: "task-1",
  taskVersion: "1",
  acceptedAt: "2026-01-01T00:00:00.000Z",
  buildId: "build-1",
  service: "test",
  status: "completed",
  observedAt: "2026-01-01T00:00:01.000Z",
  resultAvailability: "available",
  output: "done",
} as const satisfies RunSnapshot;
test("result polling reads from its Layer and releases the abort listener", async () => {
  const controller = new AbortController();
  const removed = vi.spyOn(controller.signal, "removeEventListener");
  const result = await Effect.runPromise(
    Effect.provide(
      waitForResultEffect(runtime, "run-1", { timeout: "1 second", signal: controller.signal }),
      resultRunReaderLayer(async () => completed),
    ),
  );
  expect(result).toBe("done");
  expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
});
test("result polling handles pre-abort before reading", async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));
  let calls = 0;
  const result = await Effect.runPromise(
    Effect.result(
      Effect.provide(
        waitForResultEffect(runtime, "run-1", { timeout: "1 second", signal: controller.signal }),
        resultRunReaderLayer(async () => {
          calls += 1;
          return completed;
        }),
      ),
    ),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(JobResultFailure);
  expect(calls).toBe(0);
});
test("result polling releases its listener on abort during a pending read", async () => {
  const controller = new AbortController();
  const removed = vi.spyOn(controller.signal, "removeEventListener");
  let started!: () => void;
  const begun = new Promise<void>((resolve) => {
    started = resolve;
  });
  const execution = Effect.runPromise(
    Effect.result(
      Effect.provide(
        waitForResultEffect(runtime, "run-1", { timeout: "1 second", signal: controller.signal }),
        resultRunReaderLayer(async () => {
          started();
          return new Promise<RunSnapshot>(() => undefined);
        }),
      ),
    ),
  );
  await begun;
  controller.abort(new Error("cancelled"));
  const result = await execution;
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result))
    expect(result.failure.cause).toMatchObject({ message: "cancelled" });
  expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
});
test("result polling cleans partial abort registration failures", async () => {
  const controller = new AbortController();
  const removed = vi.spyOn(controller.signal, "removeEventListener");
  vi.spyOn(controller.signal, "addEventListener").mockImplementation(() => {
    throw new Error("registration failed");
  });
  const result = await Effect.runPromise(
    Effect.result(
      Effect.provide(
        waitForResultEffect(runtime, "run-1", { timeout: "1 second", signal: controller.signal }),
        resultRunReaderLayer(async () => completed),
      ),
    ),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result))
    expect(result.failure.cause).toMatchObject({ message: "registration failed" });
  expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
});
test("result polling expires on TestClock time without a real timer", async () => {
  const pending = {
    ...completed,
    status: "running",
    resultAvailability: "pending",
  } as unknown as RunSnapshot;
  let calls = 0;
  const layer = Layer.mergeAll(
    resultRunReaderLayer(async () => {
      calls += 1;
      return pending;
    }),
    TestClock.layer(),
  );
  const result = await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Effect.result(waitForResultEffect(runtime, "run-1", { timeout: "1 second" })),
        );
        yield* TestClock.adjust("1 second");
        return yield* Fiber.join(fiber);
      }),
      layer,
    ),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(JobResultFailure);
    expect(result.failure.cause).toBeInstanceOf(JobResultUnavailableError);
  }
  expect(calls).toBeGreaterThan(0);
});
test("result polling times out and aborts a stalled native read", async () => {
  let started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  let readSignal: AbortSignal | undefined;
  let stopped = false;
  const layer = Layer.mergeAll(
    resultRunReaderLayer(async (_runtime, _runId, signal) => {
      readSignal = signal;
      return new Promise<RunSnapshot>((resolve) => {
        signal?.addEventListener(
          "abort",
          () => {
            stopped = true;
            resolve(completed);
          },
          { once: true },
        );
        started();
      });
    }),
    TestClock.layer(),
  );
  const result = await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Effect.result(waitForResultEffect(runtime, "run-1", { timeout: "1 second" })),
        );
        yield* Effect.promise(() => began);
        yield* TestClock.adjust("1 second");
        return yield* Fiber.join(fiber);
      }),
      layer,
    ),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result))
    expect(result.failure.cause).toBeInstanceOf(JobResultUnavailableError);
  expect(readSignal?.aborted).toBe(true);
  expect(stopped).toBe(true);
});
