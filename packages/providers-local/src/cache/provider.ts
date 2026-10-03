import { promiseCacheProvider } from "./provider.adapter.js";
import { makeCacheOperations } from "./operations.js";
import { Clock, Context, Deferred, Effect, Layer, Ref, Semaphore } from "effect";
import {
  localOperation,
  localPromise,
  localSync,
  runLocal,
  runLocalSync,
  type LocalOperationError,
} from "../local-effect.js";
import { normalizeCacheId, normalizeSchemaVersion } from "./keys.js";
import { normalizePolicy, readClock } from "./policy.js";
import { LocalCacheStore } from "./store.js";
import {
  LOCAL_CACHE_CAPABILITIES,
  LOCAL_CACHE_DURABLE_CAPABILITIES,
  LocalCacheStateError,
  type LocalCacheProvider,
  type LocalCacheProviderOptions,
} from "./types.js";
import { readCacheState, snapshotPath, writeCacheState } from "./persistence.js";
import { ensureOwnedDirectory, quarantineStateFile } from "../state.js";
import { createLocalCacheInspector } from "./inspector.js";
import type { LocalCacheEffects } from "./provider.types.js";

/** Cache state, producer admission and durable writes share one owner. */
export class LocalCacheService extends Context.Service<LocalCacheService, LocalCacheEffects>()(
  "@relkit/providers-local/Cache",
) {}

/**
 * Creates the existing Promise cache API over an Effect service.
 * @param options - Namespace, byte-LRU policy, persistence and test clock settings.
 * @returns A provider whose close operation stops further mutation.
 */
export function createLocalCacheProvider(
  options: LocalCacheProviderOptions = {},
): LocalCacheProvider {
  return promiseCacheProvider(runLocalSync(makeLocalCacheService(options)));
}

/**
 * Provides a cache and commits its final snapshot at scope exit.
 * @param options - Cache configuration.
 * @returns A substitutable live cache layer.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { LocalCacheService, localCacheLayer } from "./provider.js";
 *
 * const program = Effect.gen(function* () {
 *   const cache = yield* LocalCacheService;
 *     yield* cache.set("answer", 42);
 *     return yield* cache.get("answer");
 * });
 * await Effect.runPromise(program.pipe(Effect.provide(localCacheLayer())));
 * ```
 */
export function localCacheLayer(options: LocalCacheProviderOptions = {}) {
  return Layer.effect(
    LocalCacheService,
    Effect.acquireRelease(makeLocalCacheService(options), (service) =>
      service.close().pipe(Effect.orDie),
    ),
  );
}

/**
 * Acquires the cache's indexes, serialization permit and producer coordination.
 * @param options - Namespace, policy, persistence and optional legacy clock.
 * @returns A synchronous construction effect with lazy operation methods.
 * @remarks The persisted byte-LRU representation is retained; in-flight producers are never persisted.
 */
export const makeLocalCacheService: (
  options?: LocalCacheProviderOptions,
) => Effect.Effect<LocalCacheEffects, LocalOperationError> = Effect.fn("Cache.create")(
  function* (options: LocalCacheProviderOptions = {}) {
    const cacheId = yield* localSync(() => normalizeCacheId(options.cacheId ?? "default"));
    const schemaVersion = yield* localSync(() =>
      normalizeSchemaVersion(options.schemaVersion ?? 1),
    );
    const policy = yield* localSync(() => normalizePolicy(options));
    const store = new LocalCacheStore(policy);
    const requestedRoot = options.stateRoot;
    const stateRoot =
      requestedRoot === undefined
        ? undefined
        : yield* localSync(() => ensureOwnedDirectory(requestedRoot));
    const path = stateRoot === undefined ? undefined : snapshotPath(stateRoot);
    if (path !== undefined) {
      const restored = yield* localSync(() => readCacheState(path, cacheId, schemaVersion));
      if (restored !== undefined && stateRoot !== undefined)
        yield* localSync(() => {
          try {
            store.restore(restored);
          } catch {
            quarantineStateFile(path, stateRoot);
          }
        });
    }
    const closed = yield* Ref.make(false);
    const flights = yield* Ref.make(
      new Map<string, Deferred.Deferred<unknown, LocalOperationError>>(),
    );
    const writes = yield* Semaphore.make(1);
    const configuredClock = options.clock ?? options.now;
    /**
     * Reads the configured cache clock or the caller Effect Clock.
     * @returns A lazy effect yielding current milliseconds.
     */
    const time = () =>
      configuredClock !== undefined
        ? localSync(() => readClock(configuredClock))
        : Clock.currentTimeMillis;
    /**
     * Checks whether the owner still admits new operations.
     * @returns A lazy validation effect failing with the established closed-owner error.
     */
    const ensureOpen = () =>
      Effect.flatMap(Ref.get(closed), (value) =>
        localSync(() => {
          if (value) throw new LocalCacheStateError("Cache provider is closed");
        }),
      );
    /**
     * Copies owner state into its safe immutable inspection representation.
     * @returns The snapshot operation without exposing mutable owner state.
     */
    const snapshot = Effect.fn("Cache.snapshot")(
      function* () {
        const now = yield* time();
        store.purgeExpired(now);
        return Object.freeze({
          version: 1 as const,
          cacheId,
          schemaVersion,
          ...store.snapshot(),
          inFlight: (yield* Ref.get(flights)).size,
        });
      },
      (effect) => localOperation("Cache.snapshot", effect),
    );
    /**
     * Notifies the optional cache observer without allowing its failure to alter cache results.
     * @returns A lazy effect completing after isolated observation.
     */
    const changed = () =>
      Effect.flatMap(snapshot(), (value) => localSync(() => options.onSnapshot?.(value))).pipe(
        Effect.ignore,
      );
    /**
     * Serializes cache snapshot writes through the persistence permit.
     * @returns A lazy effect completing after the captured snapshot is committed.
     */
    const persist = () =>
      path === undefined
        ? Effect.void
        : Effect.gen(function* () {
            const value = store.exportState();
            yield* writes.withPermits(1)(
              localPromise(() => writeCacheState(path, value, cacheId, schemaVersion)).pipe(
                Effect.uninterruptible,
              ),
            );
          });
    const operations = makeCacheOperations({
      cacheId,
      schemaVersion,
      policy,
      store,
      flights,
      time,
      ensureOpen,
      changed,
      persist,
    });
    const close = yield* Effect.cached(
      Effect.fn("Cache.close")(
        function* () {
          if (yield* Ref.get(closed)) return;
          yield* Ref.set(closed, true);
          if (path !== undefined) {
            store.purgeExpired(yield* time());
            yield* persist();
          }
          yield* writes.withPermits(1)(Effect.void);
          store.clear();
        },
        (effect) => localOperation("Cache.close", effect),
      )(),
    );
    const inspector = createLocalCacheInspector(store, () =>
      readClock(options.clock ?? options.now ?? Date.now),
    );
    return LocalCacheService.of({
      metadata: {
        cacheId,
        schemaVersion,
        policy,
        capabilities:
          stateRoot === undefined ? LOCAL_CACHE_CAPABILITIES : LOCAL_CACHE_DURABLE_CAPABILITIES,
        ...(stateRoot === undefined ? {} : { stateRoot }),
      },
      snapshot,
      ...operations,
      close: () => close,
      ready: Effect.fn("Cache.ready")(() => localOperation("Cache.ready", Effect.void)),
      inspector: {
        scan: (request) =>
          runLocal(
            localOperation(
              "Cache.inspectScan",
              localPromise(() => inspector.scan(request)),
            ),
            request.signal,
          ),
        value: (request) =>
          runLocal(
            localOperation(
              "Cache.inspectValue",
              localPromise(() => inspector.value(request)),
            ),
            request.signal,
          ),
      },
    });
  },
  (effect) => localOperation("Cache.create", effect),
);
