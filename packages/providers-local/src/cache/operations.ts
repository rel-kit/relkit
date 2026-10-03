import type { CacheOperationContext, CacheOperationOptions } from "@relkit/cache";
import { Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import { createLocalCacheKey } from "./keys.js";
import { assertActive, clone } from "./policy.js";
import { MISSING } from "./store.js";
import { LocalCachePolicyError } from "./types.js";
import { writeCacheEntry } from "./write.js";
import type { CacheOperationState } from "./operations.types.js";
import type { LocalCacheEffects } from "./provider.types.js";
import { makeCacheSingleFlight } from "./single-flight.js";

/**
 * Composes reads and writes over one cache lifecycle and persistence owner.
 * @param owner - Shared indexes, clock, producer state and persistence coordination.
 * @returns Named operations preserving byte-LRU, TTL and public error semantics.
 */
export function makeCacheOperations(
  owner: CacheOperationState,
): Pick<LocalCacheEffects, "get" | "set" | "delete" | "has" | "increment" | "getOrSet"> {
  const { cacheId, schemaVersion, policy, store, flights, time, ensureOpen, changed, persist } =
    owner;
  /**
   * Reads validated state through the owning storage or cache boundary.
   * @param key - Normalized or caller-provided storage key.
   * @param context - Caller cancellation, deadline and scope metadata.
   * @returns A lazy read effect retaining the existing value and error contract.
   */
  const read = (key: unknown, context?: CacheOperationContext) =>
    Effect.gen(function* () {
      yield* ensureOpen();
      const now = yield* time();
      const result = yield* localSync(() =>
        store.read(
          createLocalCacheKey(cacheId, schemaVersion, key),
          assertActive(context, () => now),
        ),
      );
      if (result.expired) yield* changed();
      return result.value;
    });
  /**
   * Reads one cache value, expiring stale entries and updating safe counters.
   * @param key - Normalized or caller-provided storage key.
   * @param context - Caller cancellation, deadline and scope metadata.
   * @returns A lazy effect yielding the cached value or undefined.
   */
  const get = Effect.fn("Cache.get")(
    function* (key: unknown, context?: CacheOperationContext) {
      const value = yield* read(key, context);
      return value === MISSING ? undefined : clone(value);
    },
    (effect) => localOperation("Cache.get", effect),
  );
  /**
   * Validates and stores one cache value before awaiting persistence.
   * @param key - Normalized or caller-provided storage key.
   * @param value - Caller value to validate and store.
   * @param settings - TTL and operation-specific policy settings.
   * @param context - Caller cancellation, deadline and scope metadata.
   * @returns A lazy write effect completing after the configured persistence boundary.
   */
  const set = Effect.fn("Cache.set")(
    function* (
      key: unknown,
      value: unknown,
      settings?: CacheOperationOptions,
      context?: CacheOperationContext,
    ) {
      yield* ensureOpen();
      const now = yield* time();
      yield* localSync(() =>
        writeCacheEntry(
          store,
          policy,
          createLocalCacheKey(cacheId, schemaVersion, key),
          value,
          settings,
          assertActive(context, () => now),
        ),
      );
      yield* persist();
      yield* changed();
    },
    (effect) => localOperation("Cache.set", effect),
  );
  /**
   * Removes one cache entry and persists the changed snapshot.
   * @param key - Normalized or caller-provided storage key.
   * @param context - Caller cancellation, deadline and scope metadata.
   * @returns A lazy effect reporting whether an entry was removed.
   */
  const remove = Effect.fn("Cache.delete")(
    function* (key: unknown, context?: CacheOperationContext) {
      yield* ensureOpen();
      const now = yield* time();
      const removed = yield* localSync(() => {
        assertActive(context, () => now);
        return store.remove(createLocalCacheKey(cacheId, schemaVersion, key));
      });
      if (removed) {
        yield* persist();
        yield* changed();
      }
    },
    (effect) => localOperation("Cache.delete", effect),
  );
  /**
   * Validates a numeric cache entry and stores its bounded increment.
   * @param key - Normalized or caller-provided storage key.
   * @param delta - Numeric increment amount.
   * @param settings - TTL and operation-specific policy settings.
   * @param context - Caller cancellation, deadline and scope metadata.
   * @returns A lazy effect yielding the updated numeric value.
   */
  const increment = Effect.fn("Cache.increment")(
    function* (
      key: unknown,
      delta: number,
      settings?: CacheOperationOptions,
      context?: CacheOperationContext,
    ) {
      const current = yield* read(key, context);
      const value = current === MISSING ? 0 : current;
      const result = yield* localSync(() => {
        if (!Number.isFinite(delta))
          throw new LocalCachePolicyError("Cache increment delta must be finite");
        if (typeof value !== "number" || !Number.isFinite(value))
          throw new LocalCachePolicyError("Cache increment requires a finite numeric value");
        if (!Number.isFinite(value + delta))
          throw new LocalCachePolicyError("Cache increment overflowed");
        return value + delta;
      });
      yield* set(key, result, settings, context);
      return result;
    },
    (effect) => localOperation("Cache.increment", effect),
  );
  return {
    get,
    set,
    delete: remove,
    increment,
    getOrSet: makeCacheSingleFlight(owner, read),
    has: Effect.fn("Cache.has")((key, context) =>
      localOperation(
        "Cache.has",
        Effect.map(read(key, context), (value) => value !== MISSING),
      ),
    ),
  };
}
