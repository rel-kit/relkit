import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import {
  CacheIncrementUnsupportedError,
  CacheProviderError,
  CacheProviderFailureError,
  CacheSchemaValidationError,
  cacheRuntimeLayer,
  createCacheClient,
  createCacheClientEffect,
  getCacheEffect,
} from "../src/client.js";

describe("cache bridge and validation boundaries", () => {
  test("returns missing reads and accepts an absent provider source", async () => {
    const empty = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      source: { get: () => undefined },
    });
    expect(await empty.get("sku")).toBeUndefined();
    const absent = await Effect.runPromise(
      Effect.flip(
        createCacheClientEffect({ ownerId: "orders", cacheId: "prices", source: undefined }).pipe(
          Effect.flatMap((client) => client.get("sku")),
        ),
      ),
    );
    expect(absent).toBeInstanceOf(CacheProviderError);
  });
  test("maps a throwing validator to safe issues", async () => {
    const schema = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: () => {
          throw new Error("secret validator detail");
        },
      },
    };
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      source: { get: () => 1 },
      valueSchema: schema,
    });
    const error = await client.get("sku").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(CacheSchemaValidationError);
    expect((error as CacheSchemaValidationError).issues).toEqual([
      { message: "Invalid cache value" },
    ]);
  });
  test("rejects numeric contracts that decode zero to a nonnumber", async () => {
    const textSchema = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: (value: unknown) => ({ value: String(value) }),
      },
    };
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      source: { increment: () => 2 },
      valueSchema: textSchema,
    });
    await expect(
      (client as { increment: (key: string) => Promise<unknown> }).increment("sku"),
    ).rejects.toBeInstanceOf(CacheIncrementUnsupportedError);
  });
  test("keeps bridge rejection classification and original provider cause", async () => {
    const observed: string[] = [];
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      source: {},
      bridge: {
        run: async () => {
          throw new Error("bridge offline");
        },
      },
      onOperation: ({ outcome }) => observed.push(outcome),
    });
    await expect(client.get("sku")).rejects.toThrow("bridge offline");
    expect(observed).toEqual(["provider-failure"]);
  });
  test.each([
    ["AbortError", "cancelled"],
    ["TimeoutError", "timeout"],
  ] as const)("classifies provider %s failures by their original cause", async (name, outcome) => {
    const cause = Object.assign(new Error("provider stopped"), { name });
    const observed: string[] = [];
    const options = {
      ownerId: "orders",
      cacheId: "prices",
      source: { get: () => Promise.reject(cause) },
      onOperation: (operation: { outcome: string }) => observed.push(operation.outcome),
    };
    const client = createCacheClient(options);
    await expect(client.get("sku")).rejects.toBe(cause);
    const failure = await Effect.runPromise(
      Effect.flip(getCacheEffect("sku").pipe(Effect.provide(cacheRuntimeLayer(options)))),
    );
    expect(failure).toBeInstanceOf(CacheProviderFailureError);
    expect((failure as CacheProviderFailureError).cause).toBe(cause);
    expect(observed).toEqual([outcome, outcome]);
  });
  test.each([
    ["AbortError", "cancelled"],
    ["TimeoutError", "timeout"],
  ] as const)("classifies bridge %s failures by their original cause", async (name, outcome) => {
    const cause = Object.assign(new Error("bridge stopped"), { name });
    const observed: string[] = [];
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      source: { get: () => 1 },
      bridge: {
        run: async () => {
          throw cause;
        },
      },
      onOperation: ({ outcome: result }) => observed.push(result),
    });
    await expect(client.get("sku")).rejects.toBe(cause);
    expect(observed).toEqual([outcome]);
  });
});
