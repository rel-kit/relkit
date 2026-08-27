import { describe, expect, test } from "bun:test";
import { z } from "@relkit/schema";
import { createTestRuntime } from "./src/index.ts";

describe("testing bucket and cache fakes", () => {
  test("uses public clients, deterministic TTLs, and named failures", async () => {
    const runtime = createTestRuntime({ startTimeMs: 100 });
    const bucket = runtime.fakes.createBucket("assets");
    const cache = runtime.fakes.createCache("prices", {
      keySchema: z.object({ sku: z.string() }),
      valueSchema: z.number(),
      defaultTtlMs: 10,
    });

    await bucket.seed("asset.bin", new Uint8Array([1, 2]));
    expect(await bucket.read("asset.bin")).toEqual(new Uint8Array([1, 2]));
    runtime.fakes.failures.once("bucket.before-write");
    await expect(bucket.put("asset.bin", new Uint8Array([3]))).rejects.toThrow();
    expect(await bucket.read("asset.bin")).toEqual(new Uint8Array([1, 2]));
    runtime.fakes.failures.once("bucket.after-write-before-ack");
    await expect(bucket.put("asset.bin", new Uint8Array([3]))).rejects.toThrow();
    expect(await bucket.read("asset.bin")).toEqual(new Uint8Array([3]));

    await cache.seed({ sku: "a" }, 25);
    runtime.fakes.failures.once("cache.before-set");
    await expect(cache.set({ sku: "a" }, 26)).rejects.toThrow();
    expect(await cache.read({ sku: "a" })).toBe(25);
    await runtime.clock.advance(10);
    expect(await cache.read({ sku: "a" })).toBeUndefined();
    expect(bucket.stateRoot).not.toBe(cache.stateRoot);
    await runtime.close();
  });
});
