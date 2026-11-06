/**
 * Runtime entry: the cache provider itself and the registration RelKit's server uses to create it
 * for each profile that selects `starterCache()`.
 */
import type { CacheOperationContext, CacheOperationOptions, CacheProvider } from "relkit/cache";
import { canonicalJson } from "relkit/contracts";
import type { RuntimeProviderContext, RuntimeProviderIntegration } from "relkit/provider";

/** Where entries live. Swap it for a client of your backend; tests pass a failing one. */
export interface StarterStore {
  get(key: string): Promise<{ readonly value: string; readonly expiresAt?: number } | undefined>;
  set(key: string, entry: { readonly value: string; readonly expiresAt?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Settings of one cache provider. */
export interface StarterCacheProviderOptions {
  /** Namespace of the profile; keys of two profiles never collide. */
  readonly cacheId: string;
  readonly maxEntries?: number;
  /** Backend store; an in-memory map by default. */
  readonly store?: StarterStore;
}

/** The cache provider with its lifecycle methods. */
export type StarterCacheProvider = Required<Omit<CacheProvider, "capabilities">> &
  Pick<CacheProvider, "capabilities"> & {
    readonly ready: () => Promise<void>;
    readonly close: () => Promise<void>;
  };

/**
 * Creates the cache provider.
 * @param options - Namespace, size limit and store.
 * @returns A provider that passes `@relkit/testing/cache-conformance`.
 */
export function createStarterCacheProvider(
  options: StarterCacheProviderOptions,
): StarterCacheProvider {
  const store = options.store ?? memoryStore(options.maxEntries ?? 1000);
  const flights = new Map<string, Promise<unknown>>();
  let closed = false;
  const key = (value: unknown) => `${options.cacheId}:${canonicalJson(value)}`;
  const open = (context?: CacheOperationContext) => {
    if (closed) throw new Error("The starter cache provider is closed");
    context?.signal.throwIfAborted();
  };
  const get = async (name: unknown, context?: CacheOperationContext) => {
    open(context);
    const entry = await store.get(key(name));
    if (entry === undefined) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      await store.delete(key(name));
      return undefined;
    }
    return JSON.parse(entry.value) as unknown;
  };
  const set = async (
    name: unknown,
    value: unknown,
    settings?: CacheOperationOptions,
    context?: CacheOperationContext,
  ) => {
    open(context);
    await store.set(key(name), {
      value: canonicalJson(value),
      ...(settings?.ttlMs === undefined ? {} : { expiresAt: Date.now() + settings.ttlMs }),
    });
  };
  return Object.freeze({
    capabilities: Object.freeze({ increment: true }),
    get,
    set,
    delete: async (name: unknown, context?: CacheOperationContext) => {
      open(context);
      await store.delete(key(name));
    },
    has: async (name: unknown, context?: CacheOperationContext) =>
      (await get(name, context)) !== undefined,
    getOrSet: async (
      name: unknown,
      produce: () => unknown,
      settings?: CacheOperationOptions,
      context?: CacheOperationContext,
    ) => {
      const cached = await get(name, context);
      if (cached !== undefined) return cached;
      const pending = flights.get(key(name));
      if (pending !== undefined) return pending;
      const flight = Promise.resolve(produce()).then(async (value) => {
        await set(name, value, settings, context);
        return value;
      });
      flights.set(key(name), flight);
      try {
        return await flight;
      } finally {
        flights.delete(key(name));
      }
    },
    increment: async (
      name: unknown,
      amount = 1,
      settings?: CacheOperationOptions,
      context?: CacheOperationContext,
    ) => {
      const current = await get(name, context);
      const next = (typeof current === "number" ? current : 0) + amount;
      await set(name, next, settings, context);
      return next;
    },
    ready: async () => open(),
    close: async () => {
      closed = true;
    },
  });
}

/** The registration RelKit's server loads from this entry. */
export const runtimeIntegration = Object.freeze({
  kind: "runtime-integration",
  integrationId: "starter",
  registrations: Object.freeze([
    {
      capability: "cache",
      adapterId: "starter-memory-cache",
      protocolVersion: 1,
      create: ({ profile, behavior }: RuntimeProviderContext) => {
        const settings = (behavior ?? {}) as { readonly maxEntries?: number };
        const provider = createStarterCacheProvider({
          cacheId: profile,
          ...(settings.maxEntries === undefined ? {} : { maxEntries: settings.maxEntries }),
        });
        return { value: provider, ready: provider.ready, release: provider.close };
      },
    },
  ]),
}) satisfies RuntimeProviderIntegration<"starter">;

/**
 * An in-memory store that drops the oldest entry past `maxEntries`.
 * @param maxEntries - Size limit.
 * @returns The store.
 */
function memoryStore(maxEntries: number): StarterStore {
  const entries = new Map<string, { readonly value: string; readonly expiresAt?: number }>();
  return {
    get: async (name) => entries.get(name),
    set: async (name, entry) => {
      entries.delete(name);
      entries.set(name, entry);
      if (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
    },
    delete: async (name) => void entries.delete(name),
  };
}
