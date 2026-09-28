import { describe, expect, test } from "vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import {
  CacheOperationCancelledError,
  CacheOperationTimeoutError,
  cacheRuntimeLayer,
  createCacheClient,
  getCacheEffect,
  getOrSetCacheEffect,
} from "../src/client.js";
describe("cache bridge interruption", () => {
  test("does not start a bridge or provider with an already aborted caller signal", async () => {
    const caller = new AbortController();
    caller.abort();
    let bridgeStarts = 0;
    let providerStarts = 0;
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      signal: () => caller.signal,
      bridge: {
        run: (operation) => {
          bridgeStarts++;
          return Promise.resolve(operation());
        },
      },
      source: {
        get: () => {
          providerStarts++;
          return 1;
        },
      },
    });
    await expect(client.get("sku")).rejects.toBeInstanceOf(CacheOperationCancelledError);
    expect(bridgeStarts).toBe(0);
    expect(providerStarts).toBe(0);
  });
  test("caller cancellation aborts bridge provider work", async () => {
    const caller = new AbortController();
    let providerSignal: AbortSignal | undefined;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      signal: () => caller.signal,
      bridge: { run: async (operation) => operation() },
      source: {
        get: (_key: unknown, context?: { signal: AbortSignal }) => {
          providerSignal = context?.signal;
          started();
          return new Promise(() => undefined);
        },
      },
    });
    const request = client.get("sku");
    await ready;
    caller.abort();
    await expect(request).rejects.toBeInstanceOf(CacheOperationCancelledError);
    expect(providerSignal?.aborted).toBe(true);
  });
  test("a bridge deadline interrupts active provider work", async () => {
    let providerSignal: AbortSignal | undefined;
    const layer = cacheRuntimeLayer({
      ownerId: "orders",
      cacheId: "prices",
      deadline: () => 100,
      bridge: { run: async (operation) => operation() },
      source: {
        get: (_key: unknown, context?: { signal: AbortSignal }) => {
          providerSignal = context?.signal;
          return new Promise(() => undefined);
        },
      },
    });
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* getCacheEffect("sku").pipe(Effect.provide(layer), Effect.forkChild);
        yield* Effect.yieldNow;
        yield* TestClock.adjust(101);
        return yield* Fiber.join(fiber).pipe(Effect.flip);
      }).pipe(Effect.provide(TestClock.layer())),
    );
    expect(failure).toBeInstanceOf(CacheOperationTimeoutError);
    expect(providerSignal?.aborted).toBe(true);
  });
  test("interrupts provider work started inside a bridge", async () => {
    let providerSignal: AbortSignal | undefined;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const layer = cacheRuntimeLayer({
      ownerId: "orders",
      cacheId: "prices",
      bridge: { run: async (operation) => operation() },
      source: {
        get: (_key: unknown, context?: { signal: AbortSignal }) => {
          providerSignal = context?.signal;
          started();
          return new Promise(() => undefined);
        },
      },
    });
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* getCacheEffect("sku").pipe(Effect.provide(layer), Effect.forkChild);
        yield* Effect.promise(() => ready);
        yield* Fiber.interrupt(fiber);
      }),
    );
    expect(providerSignal?.aborted).toBe(true);
  });
  test("a bridge cannot start provider work after the exported Effect is interrupted", async () => {
    let invoke: (() => Promise<unknown>) | undefined;
    let registered!: () => void;
    const ready = new Promise<void>((resolve) => {
      registered = resolve;
    });
    let starts = 0;
    const layer = cacheRuntimeLayer({
      ownerId: "orders",
      cacheId: "prices",
      bridge: {
        run: (operation) => {
          invoke = operation;
          registered();
          return new Promise(() => undefined);
        },
      },
      source: {
        get: () => {
          starts++;
          return 1;
        },
      },
    });
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* getCacheEffect("sku").pipe(Effect.provide(layer), Effect.forkChild);
        yield* Effect.promise(() => ready);
        yield* Fiber.interrupt(fiber);
      }),
    );
    const lateInvoke = invoke;
    expect(lateInvoke).toBeDefined();
    if (lateInvoke === undefined) throw new Error("Bridge did not register its callback");
    await expect(lateInvoke()).rejects.toBeInstanceOf(CacheOperationCancelledError);
    expect(starts).toBe(0);
  });
  test("a provider cannot start a producer after getOrSet is interrupted", async () => {
    let produceLater: (() => unknown) | undefined;
    let registered!: () => void;
    const ready = new Promise<void>((resolve) => {
      registered = resolve;
    });
    let starts = 0;
    const layer = cacheRuntimeLayer({
      ownerId: "orders",
      cacheId: "prices",
      source: {
        getOrSet: (_key: unknown, produce: () => unknown) => {
          produceLater = produce;
          registered();
          return new Promise(() => undefined);
        },
      },
    });
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* getOrSetCacheEffect("sku", () => {
          starts++;
          return 1;
        }).pipe(Effect.provide(layer), Effect.forkChild);
        yield* Effect.promise(() => ready);
        yield* Fiber.interrupt(fiber);
      }),
    );
    const lateProduce = produceLater;
    if (lateProduce === undefined) throw new Error("Provider did not receive a producer");
    await expect(Promise.resolve().then(() => lateProduce())).rejects.toBeInstanceOf(
      CacheOperationCancelledError,
    );
    expect(starts).toBe(0);
  });
});
