import { describe, expect, test } from "vitest";
import { Effect, Layer, Metric } from "effect";
import { z } from "@relkit/schema";
import {
  CacheCapabilityError,
  CacheDependencyError,
  CacheIncrementUnsupportedError,
  CacheProviderError,
  CacheProviderFailureError,
  CacheSchemaValidationError,
  CacheTelemetry,
  CacheTtlPolicyError,
  CacheValidationError,
  createCacheClientEffect,
  getCacheEffect,
  hasCacheEffect,
  incrementCacheEffect,
  setCacheEffect,
  cacheRuntimeLayer,
} from "../src/client.js";
describe("Effect cache client", () => {
  test("runs every operation with a replaceable provider Layer", async () => {
    const seen: string[] = [];
    const layer = cacheRuntimeLayer({
      ownerId: "orders",
      cacheId: "prices",
      source: {
        get: (key: unknown) => {
          seen.push(`get:${key}`);
          return 3;
        },
        set: (key: unknown, value: unknown) => {
          seen.push(`set:${key}:${value}`);
        },
        has: () => true,
        increment: (_key: unknown, delta: number) => delta,
        capabilities: ["increment"],
      },
      keySchema: z.string(),
      valueSchema: z.number(),
    });
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* setCacheEffect("sku", 3);
        const value = yield* getCacheEffect("sku");
        const present = yield* hasCacheEffect("sku");
        const incremented = yield* incrementCacheEffect("sku", 2);
        return { value, present, incremented };
      }).pipe(Effect.provide(layer)),
    );
    expect(result).toEqual({ value: 3, present: true, incremented: 2 });
    expect(seen).toEqual(["set:sku:3", "get:sku"]);
  });
  test("exposes typed failures for policy, schema, missing method, and provider rejection", async () => {
    const options = {
      ownerId: "orders",
      cacheId: "prices",
      source: {},
      keySchema: z.string(),
      valueSchema: z.number(),
    };
    const layer = cacheRuntimeLayer(options);
    expect(
      await Effect.runPromise(Effect.flip(getCacheEffect("sku").pipe(Effect.provide(layer)))),
    ).toBeInstanceOf(CacheProviderError);
    expect(
      await Effect.runPromise(Effect.flip(getCacheEffect(1).pipe(Effect.provide(layer)))),
    ).toBeInstanceOf(CacheSchemaValidationError);
    expect(
      await Effect.runPromise(
        Effect.flip(setCacheEffect("sku", 1, { ttlMs: 0 }).pipe(Effect.provide(layer))),
      ),
    ).toBeInstanceOf(CacheTtlPolicyError);
    const failed = cacheRuntimeLayer({
      ...options,
      source: { get: () => Promise.reject(new Error("offline")) },
    });
    const error = await Effect.runPromise(
      Effect.flip(getCacheEffect("sku").pipe(Effect.provide(failed))),
    );
    expect(error).toBeInstanceOf(CacheProviderFailureError);
    expect((error as CacheProviderFailureError).cause).toMatchObject({ message: "offline" });
  });
  test("checks declared access, capabilities, numeric contracts, and results", async () => {
    const base = {
      ownerId: "orders",
      cacheId: "prices",
      keySchema: z.string(),
      valueSchema: z.number(),
    };
    const undeclared = cacheRuntimeLayer({ ...base, source: {}, declared: false });
    expect(
      await Effect.runPromise(Effect.flip(getCacheEffect("sku").pipe(Effect.provide(undeclared)))),
    ).toBeInstanceOf(CacheDependencyError);
    const unsupported = cacheRuntimeLayer({
      ...base,
      source: { capabilities: { increment: false } },
    });
    expect(
      await Effect.runPromise(
        Effect.flip(incrementCacheEffect("sku").pipe(Effect.provide(unsupported))),
      ),
    ).toBeInstanceOf(CacheCapabilityError);
    const text = cacheRuntimeLayer({
      ...base,
      valueSchema: z.string(),
      source: { increment: () => 2 },
    });
    expect(
      await Effect.runPromise(Effect.flip(incrementCacheEffect("sku").pipe(Effect.provide(text)))),
    ).toBeInstanceOf(CacheIncrementUnsupportedError);
    const malformed = cacheRuntimeLayer({ ...base, source: { has: () => "yes" } });
    expect(
      await Effect.runPromise(Effect.flip(hasCacheEffect("sku").pipe(Effect.provide(malformed)))),
    ).toBeInstanceOf(CacheValidationError);
  });
  test("allows deterministic telemetry substitution for success and failure", async () => {
    const observed: string[] = [];
    const telemetry = Layer.succeed(
      CacheTelemetry,
      CacheTelemetry.of({
        observe: (operation, effect) =>
          Effect.onExit(effect, (exit) =>
            Effect.sync(() => {
              observed.push(`${operation}:${exit._tag}`);
            }),
          ),
      }),
    );
    const layer = cacheRuntimeLayer({
      ownerId: "orders",
      cacheId: "prices",
      source: { get: () => 1 },
    });
    await Effect.runPromise(
      getCacheEffect("sku").pipe(Effect.provide(layer), Effect.provide(telemetry)),
    );
    await Effect.runPromise(
      Effect.flip(setCacheEffect("sku", 1).pipe(Effect.provide(layer), Effect.provide(telemetry))),
    );
    expect(observed).toEqual(["get:Success", "set:Failure"]);
  });
  test("records bounded call, failure, and duration metrics", async () => {
    const calls = Metric.withAttributes(Metric.counter("relkit_cache_operations_total"), {
      operation: "get",
    });
    const failures = Metric.withAttributes(Metric.counter("relkit_cache_failures_total"), {
      operation: "get",
    });
    const duration = Metric.withAttributes(
      Metric.histogram("relkit_cache_duration_ms", { boundaries: [0.01, 0.1, 1, 5, 10, 50, 100] }),
      { operation: "get" },
    );
    const layer = cacheRuntimeLayer({
      ownerId: "orders",
      cacheId: "prices",
      source: { get: () => 1 },
    });
    const missing = cacheRuntimeLayer({ ownerId: "orders", cacheId: "prices", source: {} });
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const beforeCalls = yield* Metric.value(calls);
        const beforeFailures = yield* Metric.value(failures);
        const beforeDuration = yield* Metric.value(duration);
        yield* getCacheEffect("sku").pipe(Effect.provide(layer));
        yield* Effect.flip(getCacheEffect("sku").pipe(Effect.provide(missing)));
        return {
          beforeCalls,
          beforeFailures,
          beforeDuration,
          afterCalls: yield* Metric.value(calls),
          afterFailures: yield* Metric.value(failures),
          afterDuration: yield* Metric.value(duration),
        };
      }),
    );
    expect(result.afterCalls.count - result.beforeCalls.count).toBe(2);
    expect(result.afterFailures.count - result.beforeFailures.count).toBe(1);
    expect(result.afterDuration.count - result.beforeDuration.count).toBe(2);
  });
  test("constructs a composable client directly", async () => {
    const effects = Effect.runSync(
      createCacheClientEffect({ ownerId: "orders", cacheId: "prices", source: { get: () => 7 } }),
    );
    expect(await Effect.runPromise(effects.get("sku"))).toBe(7);
  });
});
