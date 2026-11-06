/**
 * Authoring entry: the descriptor an application puts in `relkit.config.ts`. It is data only; it
 * opens no connection and loads no runtime code.
 */
import {
  defineConnectionContract,
  defineIntegrationReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  type ProviderAdapter,
  type ProviderBehavior,
} from "relkit/provider";

const cache = defineProviderCapability("cache");

/** The descriptor `starterCache()` returns. */
export type StarterCacheAdapter = ProviderAdapter<
  typeof cache,
  "starter-memory-cache",
  Readonly<Record<never, never>>,
  ProviderBehavior<Readonly<{ maxEntries: number }>>
>;

/** The integration id, equal to `relkit.integration.id` in package.json. */
export const starterIntegration = defineIntegrationReference("starter");

/** Settings of the in-memory cache. */
export interface StarterCacheOptions {
  /** Largest number of entries kept; the oldest entry is dropped first. Defaults to 1000. */
  readonly maxEntries?: number;
}

/**
 * Defines a cache profile backed by the starter's in-memory cache.
 * @param options - Cache settings.
 * @returns The provider descriptor.
 * @example
 * ```ts
 * import { defineApp } from "relkit/config";
 * import { starterCache } from "relkit-provider-starter";
 * export default defineApp({ cache: { memory: starterCache() }, defaults: { cache: "memory" } });
 * ```
 */
export function starterCache(options: StarterCacheOptions = {}): StarterCacheAdapter {
  const maxEntries = options.maxEntries ?? 1000;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1)
    throw new TypeError("starterCache maxEntries must be a positive integer");
  return defineProviderAdapter({
    integration: starterIntegration,
    capability: cache,
    adapterId: "starter-memory-cache",
    connectionContract: defineConnectionContract({}),
    connection: {},
    behavior: defineProviderBehavior({ maxEntries }),
  });
}
