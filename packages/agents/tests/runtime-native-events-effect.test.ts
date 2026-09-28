import { Effect, Result } from "effect";
import { expect, test, vi } from "vitest";
import { collectNativeEventsEffect } from "../src/runtime-native-events.js";

const empty = new Map();
const limits = { maxSteps: 2, maxToolCalls: 2 };

test("native event collection Effect accepts an empty stream", async () => {
  const events = { async *[Symbol.asyncIterator]() {} } as never;
  await expect(Effect.runPromise(collectNativeEventsEffect(
    events, undefined, empty, new Set(), new AbortController().signal,
    limits, empty, () => undefined, undefined, () => undefined,
  ))).resolves.toBeUndefined();
});

test("native event collection Effect tags stream failures", async () => {
  const events = { async *[Symbol.asyncIterator]() { throw new Error("stream failed"); } } as never;
  const result = await Effect.runPromise(Effect.result(collectNativeEventsEffect(
    events, undefined, empty, new Set(), new AbortController().signal,
    limits, empty, () => undefined, undefined, () => undefined,
  )));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("AgentInvocationFailure");
});

test("interrupting event collection aborts the native stream", async () => {
  const controller = new AbortController();
  let started!: () => void;
  let finish!: () => void;
  const start = new Promise<void>((resolve) => { started = resolve; });
  const events = { [Symbol.asyncIterator]: () => ({ next: () => new Promise((resolve) => {
    finish = () => resolve({ done: true });
    started();
  }) }) } as never;
  const abort = vi.fn(() => finish());
  const running = Effect.runPromise(collectNativeEventsEffect(
    events, undefined, empty, new Set(), controller.signal,
    limits, empty, () => undefined, undefined, abort,
  ), { signal: controller.signal });
  await start;
  controller.abort();
  await expect(running).rejects.toBeDefined();
  expect(abort).toHaveBeenCalledTimes(1);
});

test("pre-aborted event collection never starts the native iterator", async () => {
  const controller = new AbortController();
  controller.abort();
  let starts = 0;
  const events = { [Symbol.asyncIterator]: () => {
    starts += 1;
    return { next: async () => ({ done: true }) };
  } } as never;
  const failure = await Effect.runPromise(Effect.flip(collectNativeEventsEffect(
    events, undefined, empty, new Set(), controller.signal,
    limits, empty, () => undefined, undefined, () => undefined,
  )));
  expect(failure).toMatchObject({ _tag: "AgentInvocationFailure" });
  expect(starts).toBe(0);
});
