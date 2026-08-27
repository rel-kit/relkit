import { describe, expect, test } from "bun:test";
import { createLocalCacheKey, createLocalCacheProviderForTest } from "./src/cache/index.ts";

describe("local cache provider", () => {
  test("uses canonical namespaced keys and deterministic expiry", async () => {
    let now = 100;
    const provider = createLocalCacheProviderForTest({
      cacheId: "prices",
      schemaVersion: 2,
      clock: () => now,
      defaultTtlMs: 10,
    });

    await provider.set({ sku: "a", region: "eu" }, 25);
    expect(await provider.get({ region: "eu", sku: "a" })).toBe(25);
    now = 110;
    expect(await provider.has({ sku: "a", region: "eu" })).toBe(false);
    expect(provider.snapshot()).toMatchObject({ entries: 0, cacheId: "prices", schemaVersion: 2 });
    expect(createLocalCacheKey("prices", 2, { b: 2, a: 1 })).toBe(
      createLocalCacheKey("prices", 2, { a: 1, b: 2 }),
    );
    expect(createLocalCacheKey("prices", 2, { a: 1 })).not.toBe(
      createLocalCacheKey("prices", 3, { a: 1 }),
    );
  });

  test("evicts the least recently used entries within entry and byte bounds", async () => {
    const provider = createLocalCacheProviderForTest({
      maxEntries: 3,
      maxBytes: 110,
    });
    await provider.set("a", "one");
    await provider.set("b", "two");
    await provider.get("a");
    await provider.set("c", "three");

    expect(await provider.get("a")).toBe("one");
    expect(await provider.get("b")).toBeUndefined();
    expect(await provider.get("c")).toBe("three");
    expect(provider.snapshot().evictions).toBe(1);
  });

  test("runs one producer per key and exposes only safe snapshot metadata", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider = createLocalCacheProviderForTest({
      cacheId: "secrets",
      schemaVersion: 1,
      maxEntries: 4,
      maxBytes: 110,
      onSnapshot: (snapshot) => {
        expect(snapshot).not.toHaveProperty("key");
        expect(snapshot).not.toHaveProperty("value");
      },
    });
    const produce = async () => {
      calls += 1;
      await gate;
      return { token: "opaque" };
    };
    const first = provider.getOrSet({ token: "sensitive" }, produce);
    const second = provider.getOrSet({ token: "sensitive" }, produce);
    release();

    expect(await Promise.all([first, second])).toEqual([{ token: "opaque" }, { token: "opaque" }]);
    expect(calls).toBe(1);
    expect(provider.capabilities.singleFlight).toBe("generation-local");
    expect(provider.capabilities.persistence).toBe("memory-only");
  });

  test("supports numeric increments and deletion", async () => {
    const provider = createLocalCacheProviderForTest();

    expect(await provider.increment("count", 2)).toBe(2);
    expect(await provider.increment("count", 3)).toBe(5);
    await provider.delete("count");
    expect(await provider.has("count")).toBe(false);
    await provider.set("label", "ready");
    await expect(provider.increment("label", 1)).rejects.toMatchObject({
      code: "RELKIT_CACHE_POLICY_INVALID",
    });
  });

  test("scans bounded key metadata and reads values without KEYS", async () => {
    const provider = createLocalCacheProviderForTest({ clock: () => 100 });
    await provider.set("price:one", { cents: 100 }, { ttlMs: 500 });
    await provider.set("price:two", { cents: 200 });
    const signal = new AbortController().signal;
    const first = await provider.inspector.scan({ search: "price", limit: 1, signal });
    expect(first).toMatchObject({ items: [{ key: '"price:one"', type: "object", ttlMs: 500 }] });
    expect(first.nextCursor).toBe("1");
    expect(
      await provider.inspector.value({ key: '"price:one"', limit: 100, signal }),
    ).toMatchObject({ value: { cents: 100 }, truncated: false });
    expect(
      await provider.inspector.value({ key: '"missing"', limit: 100, signal }),
    ).toBeUndefined();
  });
});
