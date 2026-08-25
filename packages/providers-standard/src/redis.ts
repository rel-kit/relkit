import type { CacheOperationContext, CacheOperationOptions, CacheProvider } from "@zsys/cache";
import { canonicalJson } from "@zsys/contracts";
import { createRedisClient, type StandardRedisClient } from "./redis-client.js";

export interface RedisCacheOptions {
  readonly url: string;
  readonly cacheId: string;
  readonly connectionTimeoutMs?: number;
  readonly client?: StandardRedisClient;
}

export interface RedisCacheProvider extends CacheProvider {
  readonly ready: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export function createRedisCacheProvider(options: RedisCacheOptions): RedisCacheProvider {
  const client =
    options.client ??
    createRedisClient({
      url: options.url,
      ...(options.connectionTimeoutMs === undefined
        ? {}
        : { connectionTimeoutMs: options.connectionTimeoutMs }),
    });
  const flights = new Map<string, Promise<unknown>>();
  const encoded = (key: unknown): string => `${options.cacheId}:${canonicalJson(key)}`;
  const connect = async (): Promise<StandardRedisClient> => {
    if (!client.connected) await client.connect();
    return client;
  };
  const get = async (key: unknown, context?: CacheOperationContext): Promise<unknown> => {
    check(context);
    const value = await (await connect()).get(encoded(key));
    return value === null ? undefined : JSON.parse(value);
  };
  const set = async (
    key: unknown,
    value: unknown,
    settings?: CacheOperationOptions,
    context?: CacheOperationContext,
  ): Promise<void> => {
    check(context);
    await (await connect()).set(encoded(key), canonicalJson(value), settings?.ttlMs);
  };
  const remove = async (key: unknown, context?: CacheOperationContext): Promise<void> => {
    check(context);
    await (await connect()).delete(encoded(key));
  };
  const increment = async (
    key: unknown,
    amount = 1,
    settings?: CacheOperationOptions,
    context?: CacheOperationContext,
  ): Promise<number> => {
    check(context);
    const value = await (await connect()).increment(encoded(key), amount);
    if (settings?.ttlMs !== undefined) {
      await (await connect()).set(encoded(key), String(value), settings.ttlMs);
    }
    return value;
  };
  const getOrSet = async (
    key: unknown,
    produce: () => unknown | Promise<unknown>,
    settings?: CacheOperationOptions,
    context?: CacheOperationContext,
  ): Promise<unknown> => {
    const cached = await get(key, context);
    if (cached !== undefined) return cached;
    const cacheKey = encoded(key);
    const existing = flights.get(cacheKey);
    if (existing !== undefined) return existing;
    const flight = Promise.resolve(produce()).then(async (value) => {
      await set(key, value, settings, context);
      return value;
    });
    flights.set(cacheKey, flight);
    try {
      return await flight;
    } finally {
      if (flights.get(cacheKey) === flight) flights.delete(cacheKey);
    }
  };
  return Object.freeze({
    capabilities: Object.freeze({ increment: true }),
    get,
    set,
    delete: remove,
    has: async (key: unknown, context?: CacheOperationContext) =>
      (await get(key, context)) !== undefined,
    getOrSet,
    increment,
    ready: async () => {
      check(undefined);
      if (!(await (await connect()).ping())) throw new Error("Redis readiness check failed");
    },
    close: async () => {
      flights.clear();
      client.close();
    },
  });
}

function check(context: CacheOperationContext | undefined): void {
  if (context?.signal.aborted)
    throw context.signal.reason ?? new Error("Cache operation cancelled");
}
