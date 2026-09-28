import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { z } from "@relkit/schema";
import {
  CacheCapabilityError,
  CacheIncrementUnsupportedError,
  CacheProviderError,
  CacheSchemaValidationError,
  CacheTtlPolicyError,
  CacheValidationError,
  createCacheClient,
  createCacheClientEffect,
  getCacheEffect,
  getOrSetCacheEffect,
  cacheRuntimeLayer,
} from "../src/client.js";
describe("cache boundaries", () => {
  test.each([
    [{ ownerId: "", cacheId: "prices", source: {} }, "Cache ownerId must be non-empty"],
    [{ ownerId: "orders", cacheId: "", source: {} }, "Cache cacheId must be non-empty"],
    [
      { ownerId: "orders", cacheId: "prices", source: null },
      'Cache provider does not implement "get"',
    ],
    [
      { ownerId: "orders", cacheId: "prices", source: {}, keySchema: {} },
      "Cache key must be a Standard Schema v1 validator",
    ],
    [
      { ownerId: "orders", cacheId: "prices", source: {}, valueSchema: {} },
      "Cache value must be a Standard Schema v1 validator",
    ],
    [
      { ownerId: "orders", cacheId: "prices", source: {}, defaultTtlMs: 0 },
      "Cache defaultTtlMs must be a positive integer",
    ],
    [
      { ownerId: "orders", cacheId: "prices", source: {}, maxTtlMs: -1 },
      "Cache maxTtlMs must be a positive integer",
    ],
    [
      { ownerId: "orders", cacheId: "prices", source: {}, defaultTtlMs: 20, maxTtlMs: 10 },
      "Cache defaultTtlMs must not exceed maxTtlMs",
    ],
  ])("validates client construction %#", (options, message) => {
    expect(() => createCacheClient(options as never)).toThrow(message);
  });
  test("uses schema aliases and descriptor policy without leaking values into observations", async () => {
    const observations: unknown[] = [];
    const seen: unknown[] = [];
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      source: {
        set: (_key: unknown, _value: unknown, options: unknown) => {
          seen.push(options);
        },
      },
      key: z.string(),
      value: z.number(),
      descriptor: { defaultTtlMs: 100, maxTtlMs: 200 },
      onOperation: (event) => observations.push(event),
    });
    await client.set("secret-key", 7);
    expect(seen).toEqual([{ ttlMs: 100 }]);
    expect(JSON.stringify(observations)).not.toContain("secret-key");
    expect(JSON.stringify(observations)).not.toContain("7");
  });
  test("observes unsupported, validation, timeout, and provider failures", async () => {
    const outcomes: string[] = [];
    const edge: unknown[] = [];
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      keySchema: z.string(),
      valueSchema: z.number(),
      source: { capabilities: { increment: false }, get: () => "invalid" },
      onObservedEdge: (value) => edge.push(value),
      onOperation: ({ outcome }) => outcomes.push(outcome),
    });
    await expect(client.increment("sku")).rejects.toBeInstanceOf(CacheCapabilityError);
    await expect(client.get("sku")).rejects.toBeInstanceOf(CacheSchemaValidationError);
    await expect(client.has("sku")).rejects.toBeInstanceOf(CacheProviderError);
    expect(outcomes).toEqual(["unsupported", "validation-error", "provider-failure"]);
    expect(edge).toHaveLength(3);
    expect(Object.isFrozen(edge[0])).toBe(true);
  });
  test("hooks are advisory even when they throw", async () => {
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      source: { get: () => 1 },
      onObservedEdge: () => {
        throw new Error("edge sink down");
      },
      onOperation: () => {
        throw new Error("metrics sink down");
      },
    });
    expect(await client.get("sku")).toBe(1);
  });
  test("validates finite deltas, numeric results, and bounded TTLs", async () => {
    const client = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      source: { increment: () => "bad" },
      keySchema: z.string(),
      valueSchema: z.number(),
      maxTtlMs: 5,
    });
    await expect(client.increment("sku", Infinity)).rejects.toThrow(
      "Cache increment delta must be a finite number",
    );
    await expect(client.increment("sku", 1, { ttlMs: 6 })).rejects.toBeInstanceOf(
      CacheTtlPolicyError,
    );
    await expect(client.increment("sku")).rejects.toBeInstanceOf(CacheSchemaValidationError);
    const untyped = createCacheClient({
      ownerId: "orders",
      cacheId: "prices",
      source: { increment: () => "bad" },
    });
    await expect(untyped.increment("sku")).rejects.toBeInstanceOf(CacheIncrementUnsupportedError);
  });
  test("keeps producer and provider failures typed in the Effect channel", async () => {
    const layer = cacheRuntimeLayer({
      ownerId: "orders",
      cacheId: "prices",
      source: {
        getOrSet: (_key: unknown, produce: () => Promise<unknown>) => produce(),
      },
      valueSchema: z.number(),
    });
    const invalid = await Effect.runPromise(
      Effect.flip(getOrSetCacheEffect("sku", () => "bad").pipe(Effect.provide(layer))),
    );
    expect(invalid).toBeInstanceOf(CacheSchemaValidationError);
    const rejected = await Effect.runPromise(
      Effect.flip(
        getOrSetCacheEffect("sku", () => {
          throw new Error("producer failed");
        }).pipe(Effect.provide(layer)),
      ),
    );
    expect(rejected._tag).toBe("CacheProviderFailureError");
  });
  test("exposes typed client configuration failures", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        createCacheClientEffect({ ownerId: "orders", cacheId: "prices", source: {}, maxTtlMs: 0 }),
      ),
    );
    expect(error).toBeInstanceOf(CacheTtlPolicyError);
    const invalid = await Effect.runPromise(
      Effect.flip(createCacheClientEffect({ ownerId: "", cacheId: "prices", source: {} })),
    );
    expect(invalid).toBeInstanceOf(CacheValidationError);
  });
  test("validates the same configuration through the public runtime Layer", async () => {
    let starts = 0;
    const source = {
      get: () => {
        starts++;
        return 1;
      },
    };
    const invalidIdentity = await Effect.runPromise(
      Effect.flip(
        getCacheEffect("sku").pipe(
          Effect.provide(
            cacheRuntimeLayer({
              ownerId: "",
              cacheId: "prices",
              source,
            }),
          ),
        ),
      ),
    );
    expect(invalidIdentity).toBeInstanceOf(CacheValidationError);
    const invalidPolicy = await Effect.runPromise(
      Effect.flip(
        getCacheEffect("sku").pipe(
          Effect.provide(
            cacheRuntimeLayer({
              ownerId: "orders",
              cacheId: "prices",
              source,
              maxTtlMs: 0,
            }),
          ),
        ),
      ),
    );
    expect(invalidPolicy).toBeInstanceOf(CacheTtlPolicyError);
    expect(starts).toBe(0);
  });
  test("rejects a null Effect client configuration as a typed failure", async () => {
    const error = await Effect.runPromise(Effect.flip(createCacheClientEffect(null as never)));
    expect(error).toBeInstanceOf(CacheValidationError);
    expect(error.message).toBe("Cache options must be an object");
  });
});
