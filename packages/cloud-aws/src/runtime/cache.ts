import { canonicalJson } from "@zsys/contracts";
import type { CacheOperationContext, CacheOperationOptions, CacheProvider } from "@zsys/cache";
import { createValkeyClient, type ZsysValkeyClient } from "../components/ZsysCaches/client.js";
import { text } from "./config.js";

export interface AwsCacheOptions {
  readonly cacheId: string;
  readonly endpoint?: unknown;
  readonly values?: Readonly<Record<string, unknown>> | undefined;
}

export interface AwsCacheProvider extends CacheProvider {
  readonly ready: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export function createValkeyCacheProvider(options: AwsCacheOptions): AwsCacheProvider {
  const endpoint = text(options.endpoint, `AWS cache ${options.cacheId} endpoint`);
  if (endpoint === undefined) return unavailableCache(options.cacheId);
  const client = createValkeyClient({ url: endpoint });
  const flights = new Map<string, Promise<unknown>>();
  const encoded = (key: unknown): string => `${options.cacheId}:${canonicalJson(key)}`;
  const connect = async (): Promise<ZsysValkeyClient> => {
    if (!client.connected) await client.connect();
    return client;
  };
  const get = async (
    key: unknown,
    context?: CacheOperationContext,
  ): Promise<unknown | undefined> => {
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
  const has = async (key: unknown, context?: CacheOperationContext): Promise<boolean> =>
    (await get(key, context)) !== undefined;
  const increment = async (
    key: unknown,
    amount = 1,
    settings?: CacheOperationOptions,
    context?: CacheOperationContext,
  ): Promise<number> => {
    check(context);
    const value = await (await connect()).increment(encoded(key), amount);
    if (settings?.ttlMs !== undefined)
      await (await connect()).set(encoded(key), String(value), settings.ttlMs);
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
    const flight = (async () => {
      const value = await produce();
      await set(key, value, settings, context);
      return value;
    })();
    flights.set(cacheKey, flight);
    try {
      return await flight;
    } finally {
      if (flights.get(cacheKey) === flight) flights.delete(cacheKey);
    }
  };
  return Object.freeze({
    capabilities: Object.freeze({
      increment: true,
      persistence: "remote",
      singleFlight: "generation-local",
    }),
    get,
    set,
    delete: remove,
    has,
    getOrSet,
    increment,
    ready: async () => undefined,
    close: async () => {
      flights.clear();
      client.close();
    },
  });
}

function unavailableCache(cacheId: string): AwsCacheProvider {
  const fail = (): never => {
    throw new Error(`AWS cache ${cacheId} has no endpoint`);
  };
  return Object.freeze({
    capabilities: Object.freeze({
      increment: true,
      persistence: "remote",
      singleFlight: "generation-local",
    }),
    get: fail,
    set: fail,
    delete: fail,
    has: fail,
    getOrSet: fail,
    increment: fail,
    ready: async () => undefined,
    close: async () => undefined,
  });
}

function check(context: CacheOperationContext | undefined): void {
  if (context?.signal.aborted)
    throw context.signal.reason ?? new Error("Cache operation cancelled");
}
