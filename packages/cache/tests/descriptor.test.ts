import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { z } from "@relkit/schema";
import {
  CacheDescriptorError,
  assertCacheDescriptor,
  assertCacheDescriptorEffect,
  defineCache,
  defineCacheEffect,
  isCacheDescriptor,
  isCacheDescriptorEffect,
} from "../src/define-cache.js";
import { runDescriptor } from "../src/define-cache-compat.js";
const options = {
  id: "prices",
  key: z.string(),
  value: z.number(),
  defaultTtlMs: 1000,
  maxTtlMs: 5000,
};
describe("cache descriptors", () => {
  test("defines, freezes, guards, and asserts a typed descriptor", () => {
    const descriptor = defineCache(options);
    expect(descriptor.id).toBe("prices");
    expect(descriptor.defaultTtlMs).toBe(1000);
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(isCacheDescriptor(descriptor)).toBe(true);
    expect(isCacheDescriptorEffect(descriptor)).toBeDefined();
    expect(Effect.runSync(isCacheDescriptorEffect(descriptor))).toBe(true);
    assertCacheDescriptor(descriptor);
    Effect.runSync(assertCacheDescriptorEffect(descriptor));
    expect(Effect.runSync(defineCacheEffect(options))).toEqual(descriptor);
  });
  test.each([
    [null, "Cache options must be an object"],
    [{ ...options, handler: () => undefined }, "Caches cannot own handlers"],
    [{ ...options, key: null }, "key must be a Standard Schema v1 validator"],
    [{ ...options, value: {} }, "value must be a Standard Schema v1 validator"],
    [{ ...options, defaultTtlMs: 0 }, "defaultTtlMs must be a positive integer"],
    [{ ...options, maxTtlMs: -1 }, "maxTtlMs must be a positive integer"],
    [{ ...options, defaultTtlMs: 6000 }, "defaultTtlMs must not exceed maxTtlMs"],
  ])("rejects invalid descriptor input %#", async (input, message) => {
    expect(() => defineCache(input as never)).toThrow(message);
    const error = await Effect.runPromise(Effect.flip(defineCacheEffect(input as never)));
    expect(error).toBeInstanceOf(CacheDescriptorError);
    expect(error.message).toBe(message);
  });
  test("preserves shared stable ID validation in the synchronous API", async () => {
    const invalid = { ...options, id: "bad id" };
    expect(() => defineCache(invalid)).toThrow("Invalid stable ID");
    const error = await Effect.runPromise(Effect.flip(defineCacheEffect(invalid)));
    expect(error).toBeInstanceOf(CacheDescriptorError);
    expect(error.message).toContain("Invalid stable ID");
    const badProfile = { ...options, profile: "bad id" };
    expect(() => defineCache(badProfile)).toThrow("Invalid stable ID");
    expect(await Effect.runPromise(Effect.flip(defineCacheEffect(badProfile)))).toBeInstanceOf(
      CacheDescriptorError,
    );
  });
  test("preserves unexpected defects at the synchronous descriptor boundary", () => {
    const defect = new Error("descriptor construction failed");
    let caught: unknown;
    try {
      runDescriptor(Effect.die(defect));
    } catch (cause) {
      caught = cause;
    }
    expect(caught).toBe(defect);
  });
  test("checks profile and TTL invariants in both guards", async () => {
    const valid = defineCache({ ...options, profile: "shared" });
    expect(isCacheDescriptor(valid)).toBe(true);
    for (const invalid of [
      null,
      {},
      { ...valid, profile: "bad id" },
      { ...valid, defaultTtlMs: 0 },
      { ...valid, maxTtlMs: 10 },
      { ...valid, key: null },
      { ...valid, value: {} },
    ]) {
      expect(isCacheDescriptor(invalid)).toBe(false);
      expect(Effect.runSync(isCacheDescriptorEffect(invalid))).toBe(false);
      expect(() => assertCacheDescriptor(invalid)).toThrow("Invalid cache descriptor");
      expect(
        await Effect.runPromise(Effect.flip(assertCacheDescriptorEffect(invalid))),
      ).toBeInstanceOf(CacheDescriptorError);
    }
  });
});
