import { runLocal, runLocalSync } from "../local-effect.js";

import { type LocalCacheProvider } from "./types.js";

import type { LocalCacheEffects } from "./provider.types.js";

/**
 * Projects the owning service into the existing public boundary.
 * @param service - Fully acquired domain service.
 * @returns Compatible synchronous metadata and Promise methods.
 */
export function promiseCacheProvider(service: LocalCacheEffects): LocalCacheProvider {
  return Object.freeze({
    ...service.metadata,
    snapshot: () => runLocalSync(service.snapshot()),
    ready: () => runLocal(service.ready()),
    get: (key, context) => runLocal(service.get(key, context), context?.signal),
    set: (key, value, settings, context) =>
      runLocal(service.set(key, value, settings, context), context?.signal),
    delete: (key, context) => runLocal(service.delete(key, context), context?.signal),
    has: (key, context) => runLocal(service.has(key, context), context?.signal),
    getOrSet: (key, produce, settings, context) =>
      runLocal(service.getOrSet(key, produce, settings, context), context?.signal),
    increment: (key, delta, settings, context) =>
      runLocal(service.increment(key, delta, settings, context), context?.signal),
    inspector: service.inspector,
    close: () => runLocal(service.close()),
  });
}
