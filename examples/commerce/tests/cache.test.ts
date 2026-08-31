import { expect, test } from "bun:test";
import { createTestCacheFake, invokeFunction } from "@relkit/testing";
import prices from "@app/orders/cache/prices.cache.js";
import getPrice from "./fixtures/get-price.function.js";

test("cached-price tutorial reads hits and reloads after expiry or deletion", async () => {
  let now = 0;
  const cache = createTestCacheFake({
    cacheId: prices.id,
    keySchema: prices.key,
    valueSchema: prices.value,
    defaultTtlMs: prices.defaultTtlMs!,
    maxTtlMs: prices.maxTtlMs!,
    clock: () => now,
  });
  const key = { sku: "book" };
  const clients = { cache: { prices: cache.provider } };

  try {
    expect(await cache.get(key)).toBeUndefined();
    expect(await invokeFunction(getPrice, key, { clients })).toEqual({
      sku: "book",
      unitPriceCents: 1_000,
    });
    expect(await cache.get(key)).toBe(1_000);

    // A hit returns the stored price instead of the demo lookup's 1,000 cents.
    await cache.set(key, 1_200);
    expect(await invokeFunction(getPrice, key, { clients })).toEqual({
      sku: "book",
      unitPriceCents: 1_200,
    });

    now = 60_000;
    expect(await cache.has(key)).toBe(false);
    expect((await invokeFunction(getPrice, key, { clients })).unitPriceCents).toBe(1_000);

    await cache.set(key, 1_300);
    await cache.delete(key);
    expect((await invokeFunction(getPrice, key, { clients })).unitPriceCents).toBe(1_000);

    await expect(cache.set(key, -1)).rejects.toThrow();
    await expect(cache.set(key, 1_000, { ttlMs: 300_001 })).rejects.toThrow();
  } finally {
    await cache.close();
  }
});
