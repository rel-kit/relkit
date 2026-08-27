import { type CacheOperationContext, type CacheOperationOptions } from "@relkit/cache";
import { createLocalCacheKey, normalizeCacheId, normalizeSchemaVersion } from "./keys.js";
import { assertActive, clone, normalizePolicy, readClock } from "./policy.js";
import { LocalCacheStore, MISSING } from "./store.js";
import {
  LOCAL_CACHE_CAPABILITIES,
  LOCAL_CACHE_DURABLE_CAPABILITIES,
  LocalCachePolicyError,
  LocalCacheStateError,
  type LocalCacheProvider,
  type LocalCacheProviderOptions,
  type LocalCacheSnapshot,
} from "./types.js";
import { readCacheState, snapshotPath, writeCacheState } from "./persistence.js";
import { ensureOwnedDirectory, quarantineStateFile } from "../state.js";
import { writeCacheEntry } from "./write.js";
import { createLocalCacheInspector } from "./inspector.js";

export function createLocalCacheProvider(
  options: LocalCacheProviderOptions = {},
): LocalCacheProvider {
  const cacheId = normalizeCacheId(options.cacheId ?? "default");
  const schemaVersion = normalizeSchemaVersion(options.schemaVersion ?? 1);
  const policy = normalizePolicy(options);
  const clock = options.clock ?? options.now ?? Date.now;
  const store = new LocalCacheStore(policy);
  const stateRoot =
    options.stateRoot === undefined ? undefined : ensureOwnedDirectory(options.stateRoot);
  const stateSnapshot = stateRoot === undefined ? undefined : snapshotPath(stateRoot);
  if (stateSnapshot !== undefined) {
    const restored = readCacheState(stateSnapshot, cacheId, schemaVersion);
    if (restored !== undefined) {
      try {
        store.restore(restored);
      } catch {
        quarantineStateFile(stateSnapshot, stateRoot!);
      }
    }
  }
  const flights = new Map<string, Promise<unknown>>();
  let pendingWrite: Promise<void> = Promise.resolve();
  let closed = false;

  const snapshot = (): LocalCacheSnapshot => {
    store.purgeExpired(readClock(clock));
    return Object.freeze({
      version: 1,
      cacheId,
      schemaVersion,
      ...store.snapshot(),
      inFlight: flights.size,
    });
  };
  const changed = (): void => {
    try {
      options.onSnapshot?.(snapshot());
    } catch {
      // Snapshot observers are advisory and cannot change cache behavior.
    }
  };
  const ensureOpen = (): void => {
    if (closed) throw new LocalCacheStateError("Cache provider is closed");
  };
  const read = (key: unknown, context?: CacheOperationContext): unknown | typeof MISSING => {
    ensureOpen();
    const encoded = createLocalCacheKey(cacheId, schemaVersion, key);
    const result = store.read(encoded, assertActive(context, clock));
    if (result.expired) changed();
    return result.value;
  };
  const get = async (
    key: unknown,
    context?: CacheOperationContext,
  ): Promise<unknown | undefined> => {
    const value = read(key, context);
    return value === MISSING ? undefined : clone(value);
  };
  const set = async (
    key: unknown,
    value: unknown,
    optionsValue?: CacheOperationOptions,
    context?: CacheOperationContext,
  ): Promise<void> => {
    ensureOpen();
    const encoded = createLocalCacheKey(cacheId, schemaVersion, key);
    writeCacheEntry(store, policy, encoded, value, optionsValue, assertActive(context, clock));
    await persist();
    changed();
  };
  const remove = async (key: unknown, context?: CacheOperationContext): Promise<void> => {
    ensureOpen();
    const encoded = createLocalCacheKey(cacheId, schemaVersion, key);
    assertActive(context, clock);
    if (store.remove(encoded)) {
      await persist();
      changed();
    }
  };
  const has = async (key: unknown, context?: CacheOperationContext): Promise<boolean> =>
    (await get(key, context)) !== undefined;
  const getOrSet = async (
    key: unknown,
    produce: () => unknown | Promise<unknown>,
    optionsValue?: CacheOperationOptions,
    context?: CacheOperationContext,
  ): Promise<unknown> => {
    const cached = read(key, context);
    if (cached !== MISSING) return clone(cached);
    const encoded = createLocalCacheKey(cacheId, schemaVersion, key);
    const existing = flights.get(encoded);
    if (existing !== undefined) return existing.then(clone);
    const flight = produceAndStore(produce, encoded, optionsValue, context);
    flights.set(encoded, flight);
    try {
      return await flight;
    } finally {
      if (flights.get(encoded) === flight) flights.delete(encoded);
    }
  };
  const increment = async (
    key: unknown,
    delta: number,
    optionsValue?: CacheOperationOptions,
    context?: CacheOperationContext,
  ): Promise<number> => {
    if (typeof delta !== "number" || !Number.isFinite(delta)) {
      throw new LocalCachePolicyError("Cache increment delta must be finite");
    }
    const current = read(key, context);
    const value = current === MISSING ? 0 : current;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new LocalCachePolicyError("Cache increment requires a finite numeric value");
    }
    const result = value + delta;
    if (!Number.isFinite(result)) throw new LocalCachePolicyError("Cache increment overflowed");
    await set(key, result, optionsValue, context);
    return result;
  };
  const close = async (): Promise<void> => {
    if (closed) return;
    if (stateSnapshot !== undefined) {
      store.purgeExpired(readClock(clock));
      await persist();
    }
    closed = true;
    await pendingWrite;
    store.clear();
    flights.clear();
  };

  const capabilities =
    stateRoot === undefined ? LOCAL_CACHE_CAPABILITIES : LOCAL_CACHE_DURABLE_CAPABILITIES;
  const inspector = createLocalCacheInspector(store, () => readClock(clock));

  return Object.freeze({
    capabilities,
    cacheId,
    schemaVersion,
    policy,
    snapshot,
    ...(stateRoot === undefined ? {} : { stateRoot }),
    ready: async () => undefined,
    get,
    set,
    delete: remove,
    has,
    getOrSet,
    increment,
    inspector,
    close,
  });

  async function produceAndStore(
    produce: () => unknown | Promise<unknown>,
    encoded: string,
    optionsValue: CacheOperationOptions | undefined,
    context: CacheOperationContext | undefined,
  ): Promise<unknown> {
    const value = await produce();
    ensureOpen();
    const now = assertActive(context, clock);
    writeCacheEntry(store, policy, encoded, value, optionsValue, now);
    await persist();
    changed();
    return clone(value);
  }

  function persist(): Promise<void> {
    if (stateSnapshot === undefined) return Promise.resolve();
    const state = store.exportState();
    pendingWrite = pendingWrite.then(() =>
      writeCacheState(stateSnapshot, state, cacheId, schemaVersion),
    );
    return pendingWrite;
  }
}
