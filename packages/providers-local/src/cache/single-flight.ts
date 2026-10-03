import type { CacheOperationContext, CacheOperationOptions } from "@relkit/cache";
import { Deferred, Effect, Ref } from "effect";
import {
  localOperation,
  localPromise,
  localSync,
  type LocalOperationError,
} from "../local-effect.js";
import { createLocalCacheKey } from "./keys.js";
import { assertActive, clone } from "./policy.js";
import { MISSING } from "./store.js";
import { writeCacheEntry } from "./write.js";
import type { CacheOperationState, CacheRead } from "./operations.types.js";
import type { LocalCacheEffects } from "./provider.types.js";

/**
 * Coordinates one producer per key and completes all waiters on every exit.
 * @param owner - Cache lifecycle, persistence and in-flight reference.
 * @param read - TTL-aware lookup before producer admission.
 * @returns The owning getOrSet operation; cancellation clears its in-flight entry.
 * @remarks The user callback exposes no cancellation channel; interrupted results are never committed.
 */
export function makeCacheSingleFlight(
  owner: CacheOperationState,
  read: CacheRead,
): LocalCacheEffects["getOrSet"] {
  const { cacheId, schemaVersion, policy, store, flights, time, ensureOpen, changed, persist } =
    owner;
  /**
   * Shares one producer per key and releases its flight on success, failure or interruption.
   * @param key - Normalized or caller-provided storage key.
   * @param produce - Native value producer shared by concurrent callers.
   * @param settings - TTL and operation-specific policy settings.
   * @param context - Caller cancellation, deadline and scope metadata.
   * @returns The cached or produced value; followers observe the same producer outcome.
   */
  const getOrSet = Effect.fn("Cache.getOrSet")(
    function* (
      key: unknown,
      produce: () => unknown | Promise<unknown>,
      settings?: CacheOperationOptions,
      context?: CacheOperationContext,
    ) {
      const cached = yield* read(key, context);
      if (cached !== MISSING) return clone(cached);
      const encoded = yield* localSync(() => createLocalCacheKey(cacheId, schemaVersion, key));
      const fresh = yield* Deferred.make<unknown, LocalOperationError>();
      const selected = yield* Ref.modify(flights, (current) => {
        const existing = current.get(encoded);
        if (existing !== undefined) return [existing, current];
        return [fresh, new Map(current).set(encoded, fresh)];
      });
      if (selected !== fresh) return clone(yield* Deferred.await(selected));
      const production = Effect.gen(function* () {
        const value = yield* localPromise(async () => produce());
        yield* ensureOpen();
        const now = yield* time();
        yield* localSync(() =>
          writeCacheEntry(
            store,
            policy,
            encoded,
            value,
            settings,
            assertActive(context, () => now),
          ),
        );
        yield* persist();
        yield* changed();
        return clone(value);
      });
      return yield* production.pipe(
        Effect.onExit((exit) =>
          Effect.gen(function* () {
            yield* Deferred.done(fresh, exit);
            yield* Ref.update(flights, (current) => {
              const next = new Map(current);
              if (next.get(encoded) === fresh) next.delete(encoded);
              return next;
            });
          }),
        ),
      );
    },
    (effect) => localOperation("Cache.getOrSet", effect),
  );
  return getOrSet;
}
