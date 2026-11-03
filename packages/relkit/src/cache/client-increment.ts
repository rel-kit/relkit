import { Effect } from "effect";
import { CacheIncrementUnsupportedError } from "./client-errors.js";
import { observeCache } from "./client-observability.js";
import { invokeProvider, runCacheOperation } from "./client-operation.js";
import { CacheRuntime } from "./client-runtime.js";
import {
  normalizeTtlEffect,
  validateIncrementDeltaEffect,
  validateSchemaEffect,
} from "./client-validation-effect.js";

/** Increments a numeric cache value.
 * @param key - Cache key.
 * @param delta - Finite increment, defaulting to one.
 * @param settings - Optional TTL override.
 * @returns Effect of the numeric value or a tagged cache failure.
 * @example Effect.provide(incrementCacheEffect("sku", 2), cacheRuntimeLayer(options));
 */
export const incrementCacheEffect = Effect.fn("cache.increment")(
  (key: unknown, delta = 1, settings?: { ttlMs?: number }) =>
    observeCache(
      "increment",
      Effect.gen(function* () {
        const { options } = yield* CacheRuntime;
        const keySchema = options.keySchema ?? options.key ?? options.descriptor?.key;
        const valueSchema = options.valueSchema ?? options.value ?? options.descriptor?.value;
        return yield* runCacheOperation({
          operation: "increment",
          input: { key, delta, options: settings },
          capability: "increment",
          work: (provider, context) =>
            Effect.gen(function* () {
              const amount = yield* validateIncrementDeltaEffect(delta);
              if (valueSchema !== undefined) {
                const zero = yield* validateSchemaEffect(valueSchema, 0, "value").pipe(
                  Effect.catchTag("CacheSchemaValidationError", () =>
                    Effect.fail(new CacheIncrementUnsupportedError()),
                  ),
                );
                if (typeof zero !== "number") return yield* new CacheIncrementUnsupportedError();
              }
              const parsedKey = yield* validateSchemaEffect(keySchema, key, "key");
              const ttl = yield* normalizeTtlEffect(
                settings?.ttlMs,
                options.defaultTtlMs ?? options.descriptor?.defaultTtlMs,
                options.maxTtlMs ?? options.descriptor?.maxTtlMs,
              );
              const result = yield* invokeProvider("increment", provider.increment, [
                parsedKey,
                amount,
                ttl,
                context,
              ]);
              const parsed = yield* validateSchemaEffect(valueSchema, result, "value");
              if (typeof parsed !== "number") return yield* new CacheIncrementUnsupportedError();
              return parsed;
            }),
        });
      }),
    ),
);
