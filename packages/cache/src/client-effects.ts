import type { MaybePromise } from "@relkit/contracts";
import { Effect } from "effect";
import { CacheOperationCancelledError, CacheProviderFailureError } from "./client-errors.js";
import { observeCache } from "./client-observability.js";
import { invokeProvider, runCacheOperation } from "./client-operation.js";
import { CacheRuntime } from "./client-runtime.js";
import {
  normalizeTtlEffect,
  validateBooleanEffect,
  validateSchemaEffect,
} from "./client-validation-effect.js";
/** Reads a decoded cache value.
 * @param key - Cache key.
 * @returns Effect of the value, undefined, or a tagged cache failure.
 * @example Effect.provide(getCacheEffect("sku"), cacheRuntimeLayer(options));
 */
export const getCacheEffect = Effect.fn("cache.get")((key: unknown) =>
  observeCache(
    "get",
    Effect.gen(function* () {
      const { options } = yield* CacheRuntime;
      const keySchema = options.keySchema ?? options.key ?? options.descriptor?.key;
      const valueSchema = options.valueSchema ?? options.value ?? options.descriptor?.value;
      return yield* runCacheOperation({
        operation: "get",
        input: { key },
        work: (provider, context) =>
          Effect.gen(function* () {
            const parsedKey = yield* validateSchemaEffect(keySchema, key, "key");
            const value = yield* invokeProvider("get", provider.get, [parsedKey, context]);
            return value === undefined
              ? undefined
              : yield* validateSchemaEffect(valueSchema, value, "value");
          }),
      });
    }),
  ),
);
/** Writes a validated key and value.
 * @param key - Cache key.
 * @param value - Value to store.
 * @param settings - Optional TTL override.
 * @returns Effect of void or a tagged cache failure.
 * @example Effect.provide(setCacheEffect("sku", 1), cacheRuntimeLayer(options));
 */
export const setCacheEffect = Effect.fn("cache.set")(
  (key: unknown, value: unknown, settings?: { ttlMs?: number }) =>
    observeCache(
      "set",
      Effect.gen(function* () {
        const { options } = yield* CacheRuntime;
        const keySchema = options.keySchema ?? options.key ?? options.descriptor?.key;
        const valueSchema = options.valueSchema ?? options.value ?? options.descriptor?.value;
        return yield* runCacheOperation({
          operation: "set",
          input: { key, value, options: settings },
          work: (provider, context) =>
            Effect.gen(function* () {
              const parsedKey = yield* validateSchemaEffect(keySchema, key, "key");
              const parsedValue = yield* validateSchemaEffect(valueSchema, value, "value");
              const ttl = yield* normalizeTtlEffect(
                settings?.ttlMs,
                options.defaultTtlMs ?? options.descriptor?.defaultTtlMs,
                options.maxTtlMs ?? options.descriptor?.maxTtlMs,
              );
              yield* invokeProvider("set", provider.set, [parsedKey, parsedValue, ttl, context]);
            }),
        });
      }),
    ),
);
/** Deletes one key.
 * @param key - Cache key.
 * @returns Effect of void or a tagged cache failure.
 * @example Effect.provide(deleteCacheEffect("sku"), cacheRuntimeLayer(options));
 */
export const deleteCacheEffect = Effect.fn("cache.delete")((key: unknown) =>
  observeCache(
    "delete",
    Effect.gen(function* () {
      const { options } = yield* CacheRuntime;
      const keySchema = options.keySchema ?? options.key ?? options.descriptor?.key;
      return yield* runCacheOperation({
        operation: "delete",
        input: { key },
        work: (provider, context) =>
          Effect.gen(function* () {
            const parsedKey = yield* validateSchemaEffect(keySchema, key, "key");
            yield* invokeProvider("delete", provider.delete, [parsedKey, context]);
          }),
      });
    }),
  ),
);
/** Checks key presence.
 * @param key - Cache key.
 * @returns Effect of a boolean or a tagged cache failure.
 * @example Effect.provide(hasCacheEffect("sku"), cacheRuntimeLayer(options));
 */
export const hasCacheEffect = Effect.fn("cache.has")((key: unknown) =>
  observeCache(
    "has",
    Effect.gen(function* () {
      const { options } = yield* CacheRuntime;
      const keySchema = options.keySchema ?? options.key ?? options.descriptor?.key;
      return yield* runCacheOperation({
        operation: "has",
        input: { key },
        work: (provider, context) =>
          Effect.gen(function* () {
            const parsedKey = yield* validateSchemaEffect(keySchema, key, "key");
            const result = yield* invokeProvider("has", provider.has, [parsedKey, context]);
            return yield* validateBooleanEffect(result);
          }),
      });
    }),
  ),
);
/** Reads or produces and stores one value through the provider.
 * @param key - Cache key.
 * @param produce - Called on a cache miss.
 * @param settings - Optional TTL override.
 * @returns Effect of the decoded value or a tagged cache failure.
 * @example Effect.provide(getOrSetCacheEffect("sku", () => 1), cacheRuntimeLayer(options));
 */
export const getOrSetCacheEffect = Effect.fn("cache.getOrSet")(
  (key: unknown, produce: () => MaybePromise<unknown>, settings?: { ttlMs?: number }) =>
    observeCache(
      "getOrSet",
      Effect.gen(function* () {
        const { options } = yield* CacheRuntime;
        const keySchema = options.keySchema ?? options.key ?? options.descriptor?.key;
        const valueSchema = options.valueSchema ?? options.value ?? options.descriptor?.value;
        return yield* runCacheOperation({
          operation: "getOrSet",
          input: { key, options: settings },
          work: (provider, context) =>
            Effect.gen(function* () {
              const parsedKey = yield* validateSchemaEffect(keySchema, key, "key");
              const ttl = yield* normalizeTtlEffect(
                settings?.ttlMs,
                options.defaultTtlMs ?? options.descriptor?.defaultTtlMs,
                options.maxTtlMs ?? options.descriptor?.maxTtlMs,
              );
              const produced = () =>
                context.signal.aborted
                  ? Promise.reject(new CacheOperationCancelledError())
                  : Effect.runPromise(
                      Effect.gen(function* () {
                        const value = yield* Effect.tryPromise({
                          try: () => Promise.resolve(produce()),
                          catch: (cause) =>
                            new CacheProviderFailureError({ operation: "getOrSet", cause }),
                        });
                        return yield* validateSchemaEffect(valueSchema, value, "value");
                      }),
                      { signal: context.signal },
                    );
              const result = yield* invokeProvider("getOrSet", provider.getOrSet, [
                parsedKey,
                produced,
                ttl,
                context,
              ]);
              return yield* validateSchemaEffect(valueSchema, result, "value");
            }),
        });
      }),
    ),
);
