import { Context, Effect, Layer } from "effect";
import { CacheProviderError } from "./client-errors.js";
import {
  validateClientIdentityEffect,
  validateClientPolicyEffect,
} from "./client-validation-effect.js";
import type { CacheRuntimeService } from "./client-runtime.types.js";
import type { CacheClientOptions, CacheProvider } from "./client.types.js";
/** Substitutable provider and invocation configuration.
 * @example Effect.provide(getCacheEffect("sku"), cacheRuntimeLayer({ ownerId: "orders", cacheId: "prices", source: {} }));
 */
export class CacheRuntime extends Context.Service<CacheRuntime, CacheRuntimeService>()(
  "relkit/cache/CacheRuntime",
) {}
/** Creates the live provider Layer from client options.
 * @param options - Client options and provider source.
 * @returns A Layer supplying the cache runtime or failing for invalid options or source.
 * @example cacheRuntimeLayer({ ownerId: "orders", cacheId: "prices", source: {} });
 */
export function cacheRuntimeLayer(options: CacheClientOptions) {
  return Layer.effect(
    CacheRuntime,
    Effect.gen(function* () {
      yield* validateClientIdentityEffect(options);
      const provider = yield* asProviderEffect(options.source);
      yield* validateClientPolicyEffect(options);
      return CacheRuntime.of({ options, provider });
    }),
  );
}
/** Validates the provider source in Effect.
 * @param value - Provider source.
 * @returns A provider or a tagged provider error.
 * @example Effect.runSync(asProviderEffect(undefined));
 */
export const asProviderEffect = Effect.fn("cache.asProvider")((value: unknown) =>
  Effect.gen(function* () {
    if (value === undefined) return {};
    if (value === null || typeof value !== "object") return yield* new CacheProviderError("get");
    return value as CacheProvider;
  }),
);
