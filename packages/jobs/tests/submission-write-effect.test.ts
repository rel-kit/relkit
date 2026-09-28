import { Effect, Fiber, Result } from "effect";
import { expect, test } from "vitest";
import type { JobsAdapterRuntime, OperationContext } from "../src/adapter.ts";
import {
  JobSubmissionCancelledError,
  JobSubmissionUnknownError,
} from "../src/submission-errors.ts";
import {
  JobSubmissionWriteFailure,
  submitAbortable,
  submitAbortableEffect,
} from "../src/submission-write.ts";
import type { TaskSubmissionMetadata } from "../src/submission.types.ts";
const request = {} as Parameters<JobsAdapterRuntime["submit"]>[0];
const context = {} as OperationContext;
const metadata: TaskSubmissionMetadata = { operationId: "op-1", acceptanceIdentity: "accept-1" };
const adapterWith = (submit: JobsAdapterRuntime["submit"]) => ({ submit }) as JobsAdapterRuntime;
test("successful submission releases its abort listener and preserves the receipt", async () => {
  const controller = new AbortController();
  let removes = 0;
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.removeEventListener = ((...args) => {
    removes++;
    remove(...args);
  }) as typeof remove;
  const receipt = { accepted: true };
  const result = await Effect.runPromise(
    submitAbortableEffect(
      adapterWith(async () => receipt),
      request,
      context,
      controller.signal,
      metadata,
    ),
  );
  expect(result).toBe(receipt);
  expect(removes).toBe(1);
  expect(
    await submitAbortable(
      adapterWith(async () => receipt),
      request,
      context,
      new AbortController().signal,
      metadata,
    ),
  ).toBe(receipt);
});
test("pre-abort and synchronous abort during registration prevent provider start", async () => {
  let starts = 0;
  const adapter = adapterWith(async () => {
    starts++;
    return {};
  });
  const controller = new AbortController();
  controller.abort();
  const pre = await Effect.runPromise(
    Effect.result(submitAbortableEffect(adapter, request, context, controller.signal, metadata)),
  );
  expect(Result.isFailure(pre)).toBe(true);
  if (Result.isFailure(pre)) {
    expect(pre.failure).toBeInstanceOf(JobSubmissionWriteFailure);
    expect(pre.failure.cause).toBeInstanceOf(JobSubmissionCancelledError);
  }
  const signal = {
    aborted: false,
    addEventListener(_name: string, listener: EventListener) {
      this.aborted = true;
      listener(new Event("abort"));
    },
    removeEventListener() {},
  } as unknown as AbortSignal;
  const during = await Effect.runPromise(
    Effect.result(submitAbortableEffect(adapter, request, context, signal, metadata)),
  );
  expect(Result.isFailure(during)).toBe(true);
  expect(starts).toBe(0);
});
test("abort after provider start reports unknown outcome and provider rejection stays original", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const adapter = adapterWith(async () => {
    started();
    return new Promise(() => undefined);
  });
  const pending = Effect.runPromise(
    Effect.result(submitAbortableEffect(adapter, request, context, controller.signal, metadata)),
  );
  await began;
  controller.abort();
  const result = await pending;
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result))
    expect(result.failure.cause).toBeInstanceOf(JobSubmissionUnknownError);
  const original = new Error("provider rejected");
  await expect(
    submitAbortable(
      adapterWith(async () => {
        throw original;
      }),
      request,
      context,
      new AbortController().signal,
      metadata,
    ),
  ).rejects.toBe(original);
});
test("registration failure releases any partial listener", async () => {
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
    Effect.result(
      submitAbortableEffect(
        adapterWith(async () => ({})),
        request,
        context,
        signal,
        metadata,
      ),
    ),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure.kind).toBe("register");
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
    submitAbortableEffect(
      adapterWith(async () => {
        started();
        return new Promise(() => undefined);
      }),
      request,
      context,
      controller.signal,
      metadata,
    ),
  );
  await began;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(removes).toBe(1);
});
test("interruption aborts the signal passed to the native submission", async () => {
  const caller = new AbortController();
  let started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  let providerSignal: AbortSignal | undefined;
  let stopped = false;
  const fiber = Effect.runFork(
    submitAbortableEffect(
      adapterWith(async (_request, current) => {
        providerSignal = current.signal;
        return new Promise((resolve) => {
          current.signal.addEventListener(
            "abort",
            () => {
              stopped = true;
              resolve({ accepted: false });
            },
            { once: true },
          );
          started();
        });
      }),
      request,
      { ...context, signal: caller.signal },
      caller.signal,
      metadata,
    ),
  );
  await began;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(providerSignal?.aborted).toBe(true);
  expect(stopped).toBe(true);
});
