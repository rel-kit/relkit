import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import { Cause, Effect, Exit, Layer } from "effect";
import { CacheProviderFailureError, CacheValidationError } from "./client-errors.js";
import {
  deleteCacheEffect,
  getCacheEffect,
  getOrSetCacheEffect,
  hasCacheEffect,
  setCacheEffect,
} from "./client-effects.js";
import { incrementCacheEffect } from "./client-increment.js";
import { observeCache } from "./client-observability.js";
import { asProviderEffect, CacheRuntime } from "./client-runtime.js";
import {
  validateClientIdentityEffect,
  validateClientPolicyEffect,
} from "./client-validation-effect.js";
import type { CacheClient, CacheClientOptions, CacheEffectClient } from "./client.types.js";
export {
  CacheCapabilityError,
  CacheDependencyError,
  CacheIncrementUnsupportedError,
  CacheOperationCancelledError,
  CacheOperationTimeoutError,
  CacheProviderError,
  CacheProviderFailureError,
  CacheSchemaValidationError,
  CacheTtlPolicyError,
  CacheValidationError,
} from "./client-errors.js";
export type * from "./client.types.js";
export {
  deleteCacheEffect,
  getCacheEffect,
  getOrSetCacheEffect,
  hasCacheEffect,
  setCacheEffect,
} from "./client-effects.js";
export { incrementCacheEffect } from "./client-increment.js";
export { CacheRuntime, cacheRuntimeLayer } from "./client-runtime.js";
export { CacheTelemetry, CacheTelemetryLive } from "./client-observability.js";
/** Constructs an Effect-first cache client with a validated provider.
 * @param options - Provider, schema, TTL, bridge, and observation options.
 * @returns An Effect of composable operations or a tagged configuration error.
 * @example Effect.runSync(createCacheClientEffect({ ownerId: "orders", cacheId: "prices", source: {} }));
 */
export const createCacheClientEffect = Effect.fn("cache.createClient")(
  <
    const KeySchema extends StandardSchemaV1 = StandardSchemaV1,
    const ValueSchema extends StandardSchemaV1 = StandardSchemaV1,
  >(
    options: CacheClientOptions<KeySchema, ValueSchema>,
  ) =>
    observeCache(
      "createClient",
      Effect.gen(function* () {
        yield* validateClientIdentityEffect(options);
        const provider = yield* asProviderEffect(options.source);
        yield* validateClientPolicyEffect(options);
        const layer = Layer.succeed(CacheRuntime, CacheRuntime.of({ options, provider }));
        const client = {
          get: (key: InferInput<KeySchema>) => getCacheEffect(key).pipe(Effect.provide(layer)),
          set: (
            key: InferInput<KeySchema>,
            value: InferOutput<ValueSchema>,
            settings?: { ttlMs?: number },
          ) => setCacheEffect(key, value, settings).pipe(Effect.provide(layer)),
          delete: (key: InferInput<KeySchema>) =>
            deleteCacheEffect(key).pipe(Effect.provide(layer)),
          has: (key: InferInput<KeySchema>) => hasCacheEffect(key).pipe(Effect.provide(layer)),
          getOrSet: (
            key: InferInput<KeySchema>,
            produce: () => InferOutput<ValueSchema> | Promise<InferOutput<ValueSchema>>,
            settings?: { ttlMs?: number },
          ) => getOrSetCacheEffect(key, produce, settings).pipe(Effect.provide(layer)),
          increment: (key: InferInput<KeySchema>, delta?: number, settings?: { ttlMs?: number }) =>
            incrementCacheEffect(key, delta, settings).pipe(Effect.provide(layer)),
        };
        return Object.freeze(client) as CacheEffectClient<
          InferInput<KeySchema>,
          InferOutput<ValueSchema>
        >;
      }),
    ),
);
/** Constructs the existing Promise cache client from its Effect implementation.
 * @param options - Provider, schema, TTL, bridge, and observation options.
 * @returns A Promise client with the established methods and generic types.
 * @throws TypeError for invalid configuration, or a tagged cache policy/provider error.
 * @example createCacheClient({ ownerId: "orders", cacheId: "prices", source: {} });
 */
export function createCacheClient<
  const KeySchema extends StandardSchemaV1 = StandardSchemaV1,
  const ValueSchema extends StandardSchemaV1 = StandardSchemaV1,
>(
  options: CacheClientOptions<KeySchema, ValueSchema>,
): CacheClient<InferInput<KeySchema>, InferOutput<ValueSchema>> {
  const exit = Effect.runSyncExit(createCacheClientEffect(options));
  if (Exit.isFailure(exit)) throwCompat(Cause.squash(exit.cause));
  const effects = exit.value;
  return Object.freeze({
    get: (key: InferInput<KeySchema>) => runCompat(effects.get(key)),
    set: (
      key: InferInput<KeySchema>,
      value: InferOutput<ValueSchema>,
      settings?: { ttlMs?: number },
    ) => runCompat(effects.set(key, value, settings)),
    delete: (key: InferInput<KeySchema>) => runCompat(effects.delete(key)),
    has: (key: InferInput<KeySchema>) => runCompat(effects.has(key)),
    getOrSet: (
      key: InferInput<KeySchema>,
      produce: () => InferOutput<ValueSchema> | Promise<InferOutput<ValueSchema>>,
      settings?: { ttlMs?: number },
    ) => runCompat(effects.getOrSet(key, produce, settings)),
    increment: (key: InferInput<KeySchema>, delta?: number, settings?: { ttlMs?: number }) =>
      runCompat(effects.increment(key, delta, settings)),
  }) as unknown as CacheClient<InferInput<KeySchema>, InferOutput<ValueSchema>>;
}
/** Preserves Promise rejection identity for provider errors and legacy TypeErrors. */
async function runCompat<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  try {
    return await Effect.runPromise(effect);
  } catch (cause) {
    throwCompat(cause);
  }
}
/** Converts typed Effect failures at the compatibility boundary. */
function throwCompat(cause: unknown): never {
  if (cause instanceof CacheProviderFailureError) throw cause.cause;
  if (cause instanceof CacheValidationError) throw new TypeError(cause.message);
  throw cause;
}
