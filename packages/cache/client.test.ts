import { describe, expect, test } from "bun:test";
import { z } from "@relkit/schema";
import {
  CacheCapabilityError,
  CacheDependencyError,
  CacheIncrementUnsupportedError,
  CacheOperationCancelledError,
  CacheSchemaValidationError,
  CacheTtlPolicyError,
  createCacheClient,
  type CacheOperationContext,
  type CacheProvider,
} from "./src/client.ts";

function provider(overrides: Partial<CacheProvider> = {}): CacheProvider {
  return {
    get: async () => 3,
    set: async () => undefined,
    delete: async () => undefined,
    has: async () => true,
    getOrSet: async (_key, produce) => produce(),
    increment: async (_key, delta) => delta,
    capabilities: { increment: true },
    ...overrides,
  };
}

describe("cache Promise client", () => {
  test("validates values, applies TTL, bridges operations, and reports hooks", async () => {
    const bridgeNames: string[] = [];
    const edges: unknown[] = [];
    const operations: unknown[] = [];
    const contexts: CacheOperationContext[] = [];
    const source = provider({
      get: async (_key, context) => {
        contexts.push(context as CacheOperationContext);
        return 3;
      },
      set: async (_key, _value, options) => {
        expect(options).toEqual({ ttlMs: 1000 });
      },
      getOrSet: async (_key, produce, options) => {
        expect(options).toEqual({ ttlMs: 2000 });
        return produce();
      },
    });
    const client = createCacheClient({
      ownerId: "orders.create",
      cacheId: "prices",
      source,
      keySchema: z.object({ sku: z.string() }),
      valueSchema: z.number().int(),
      defaultTtlMs: 1000,
      maxTtlMs: 5000,
      bridge: {
        run: async (operation, options) => {
          bridgeNames.push(options?.name ?? "");
          return operation();
        },
      },
      onObservedEdge: (edge) => edges.push(edge),
      onOperation: (operation) => operations.push(operation),
    });

    await client.set({ sku: "a" }, 3);
    await client.get({ sku: "a" });
    await client.delete({ sku: "a" });
    await client.has({ sku: "a" });
    await client.getOrSet({ sku: "a" }, async () => 4, { ttlMs: 2000 });
    await client.increment({ sku: "a" }, 2);

    expect(bridgeNames).toEqual([
      "relkit.cache.prices.set",
      "relkit.cache.prices.get",
      "relkit.cache.prices.delete",
      "relkit.cache.prices.has",
      "relkit.cache.prices.getOrSet",
      "relkit.cache.prices.increment",
    ]);
    expect(edges).toHaveLength(6);
    expect(edges[0]).toEqual({ relationship: "uses-cache", from: "orders.create", to: "prices" });
    expect(operations).toHaveLength(6);
    expect(
      operations.every((operation) => (operation as { outcome: string }).outcome === "success"),
    ).toBe(true);
    expect(contexts[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  test("rejects invalid values and TTLs before provider writes", async () => {
    let writes = 0;
    const client = createCacheClient({
      ownerId: "orders.create",
      cacheId: "prices",
      source: provider({ set: async () => void writes++ }),
      keySchema: z.string(),
      valueSchema: z.number(),
      maxTtlMs: 100,
    });

    await expect(client.set("sku", "bad" as never)).rejects.toBeInstanceOf(
      CacheSchemaValidationError,
    );
    await expect(client.set("sku", 1, { ttlMs: 101 })).rejects.toBeInstanceOf(CacheTtlPolicyError);
    expect(writes).toBe(0);
  });

  test("keeps increment unavailable for nonnumeric contracts and unsupported providers", async () => {
    const text = createCacheClient({
      ownerId: "orders.create",
      cacheId: "labels",
      source: provider({ increment: async () => "bad" }),
      keySchema: z.string(),
      valueSchema: z.string(),
    });
    await expect(
      (text as { increment: () => Promise<unknown> }).increment(),
    ).rejects.toBeInstanceOf(CacheIncrementUnsupportedError);

    const unsupported = createCacheClient({
      ownerId: "orders.create",
      cacheId: "prices",
      source: provider({ capabilities: { increment: false } }),
      keySchema: z.string(),
      valueSchema: z.number(),
    });
    await expect(unsupported.increment("sku")).rejects.toBeInstanceOf(CacheCapabilityError);
  });

  test("propagates cancellation and undeclared access", async () => {
    const controller = new AbortController();
    const pending = new Promise<void>(() => undefined);
    const client = createCacheClient({
      ownerId: "orders.create",
      cacheId: "prices",
      source: provider({
        get: async (_key, context) => {
          context?.signal.addEventListener("abort", () => undefined, { once: true });
          await pending;
          return 1;
        },
      }),
      keySchema: z.string(),
      valueSchema: z.number(),
      signal: () => controller.signal,
    });
    const execution = client.get("sku");
    controller.abort();
    await expect(execution).rejects.toBeInstanceOf(CacheOperationCancelledError);

    const undeclared = createCacheClient({
      ownerId: "orders.create",
      cacheId: "prices",
      source: provider(),
      declared: false,
    });
    await expect(undeclared.get("sku")).rejects.toBeInstanceOf(CacheDependencyError);
  });
});
