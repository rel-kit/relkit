import { describe, expect, test, vi } from "vitest";
import { Clock, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import {
  CacheOperationCancelledError,
  CacheOperationTimeoutError,
  createCacheClient,
  getCacheEffect,
  cacheRuntimeLayer,
} from "../src/client.js";
describe("cache cancellation resource", () => {
  test("does not start work after an already aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    let starts = 0;
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      signal: () => controller.signal,
      source: {
        get: () => {
          starts++;
          return 1;
        },
      },
    });
    await expect(client.get("sku")).rejects.toBeInstanceOf(CacheOperationCancelledError);
    expect(starts).toBe(0);
  });
  test("releases the abort listener after success, failure, and cancellation", async () => {
    for (const mode of ["success", "failure", "cancel"] as const) {
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, "addEventListener");
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      const client = createCacheClient({
        ownerId: "orders",
        cacheId: "prices",
        signal: () => controller.signal,
        source: {
          get: () => {
            started();
            if (mode === "failure") throw new Error("offline");
            if (mode === "cancel") return new Promise(() => undefined);
            return 1;
          },
        },
      });
      const request = client.get("sku");
      await ready;
      if (mode === "cancel") controller.abort();
      if (mode === "success") expect(await request).toBe(1);
      else await expect(request).rejects.toThrow();
      expect(add).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
      expect(remove.mock.calls.length).toBe(1);
    }
  });
  test("aborts the provider-owned signal when an operation scope closes", async () => {
    const controller = new AbortController();
    let providerSignal: AbortSignal | undefined;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      signal: () => controller.signal,
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
    expect(providerSignal?.aborted).toBe(false);
    controller.abort();
    await expect(request).rejects.toBeInstanceOf(CacheOperationCancelledError);
    expect(providerSignal?.aborted).toBe(true);
  });
  test("interrupting an Effect aborts its provider signal", async () => {
    let providerSignal: AbortSignal | undefined;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const layer = cacheRuntimeLayer({
      ownerId: "orders",
      cacheId: "prices",
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
  test("cleans up partial listener registration failure", async () => {
    const controller = new AbortController();
    vi.spyOn(controller.signal, "addEventListener").mockImplementation(() => {
      throw new Error("register failed");
    });
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      signal: () => controller.signal,
      source: { get: () => 1 },
    });
    await expect(client.get("sku")).rejects.toThrow("register failed");
    expect(remove).toHaveBeenCalledOnce();
  });
  test("handles a synchronous abort callback during registration without a late start", async () => {
    const controller = new AbortController();
    const original = controller.signal.addEventListener.bind(controller.signal);
    vi.spyOn(controller.signal, "addEventListener").mockImplementation(
      (type, listener, options) => {
        original(type, listener, options);
        if (type === "abort" && typeof listener === "function") listener(new Event("abort"));
      },
    );
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    let starts = 0;
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      signal: () => controller.signal,
      source: {
        get: () => {
          starts++;
          return 1;
        },
      },
    });
    await expect(client.get("sku")).rejects.toBeInstanceOf(CacheOperationCancelledError);
    expect(starts).toBe(0);
    expect(remove).toHaveBeenCalledOnce();
  });
  test("rejects expired deadlines before provider work", async () => {
    let starts = 0;
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      deadline: () => 0,
      source: {
        get: () => {
          starts++;
          return 1;
        },
      },
    });
    await expect(client.get("sku")).rejects.toBeInstanceOf(CacheOperationTimeoutError);
    expect(starts).toBe(0);
  });
  test("uses TestClock to expire an active deadline and interrupt provider work", async () => {
    let starts = 0;
    const layer = cacheRuntimeLayer({
      ownerId: "orders",
      cacheId: "prices",
      deadline: () => 100,
      source: {
        get: () => {
          starts++;
          return new Promise(() => undefined);
        },
      },
    });
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* getCacheEffect("sku").pipe(Effect.provide(layer), Effect.forkChild);
        yield* Effect.yieldNow;
        yield* TestClock.adjust(101);
        return yield* Fiber.join(fiber).pipe(Effect.flip);
      }).pipe(Effect.provide(TestClock.layer())),
    );
    expect(result).toBeInstanceOf(CacheOperationTimeoutError);
    expect(starts).toBe(1);
  });
});
