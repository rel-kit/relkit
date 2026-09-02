import type { CacheOperationContext, CacheOperationOptions, CacheProvider } from "@relkit/cache";
import { canonicalJson } from "@relkit/contracts";
import { createRedisClient, type RedisProtocolClient } from "./client.js";

export interface RedisCacheOptions {
  readonly url: string;
  readonly cacheId: string;
  readonly connectionTimeoutMs?: number;
  readonly client?: RedisProtocolClient;
}

export interface RedisCacheProvider extends CacheProvider {
  readonly ready: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly inspector: {
    readonly scan: (request: {
      readonly search?: string;
      readonly cursor?: string;
      readonly limit: number;
      readonly signal: AbortSignal;
    }) => Promise<{ readonly items: readonly unknown[]; readonly nextCursor?: string }>;
    readonly value: (request: {
      readonly key: string;
      readonly limit: number;
      readonly signal: AbortSignal;
    }) => Promise<unknown | undefined>;
  };
}

export function createRedisCacheProvider(options: RedisCacheOptions): RedisCacheProvider {
  const client = options.client ?? createClient(options);
  const flights = new Map<string, Promise<unknown>>();
  const encoded = (key: unknown): string => `${options.cacheId}:${canonicalJson(key)}`;
  let closed = false;
  const connect = async (): Promise<RedisProtocolClient> => {
    if (closed) throw new Error("Redis cache provider is closed");
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
    const redis = await connect();
    const value = await redis.increment(encoded(key), amount);
    if (settings?.ttlMs !== undefined) await redis.set(encoded(key), String(value), settings.ttlMs);
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
  const inspector = createInspector(options.cacheId, connect);
  return Object.freeze({
    capabilities: Object.freeze({ increment: true }),
    get,
    set,
    delete: remove,
    has: async (key: unknown, context?: CacheOperationContext) =>
      (await get(key, context)) !== undefined,
    getOrSet,
    increment,
    inspector,
    ready: async () => {
      check(undefined);
      if (!(await (await connect()).ping())) throw new Error("Redis readiness check failed");
    },
    close: async () => {
      if (closed) return;
      closed = true;
      flights.clear();
      client.close();
    },
  });
}

function createClient(options: RedisCacheOptions): RedisProtocolClient {
  return createRedisClient({
    url: options.url,
    ...(options.connectionTimeoutMs === undefined
      ? {}
      : { connectionTimeoutMs: options.connectionTimeoutMs }),
  });
}

function createInspector(
  cacheId: string,
  connect: () => Promise<RedisProtocolClient>,
): RedisCacheProvider["inspector"] {
  return Object.freeze({
    scan: async (request) => {
      check({ operation: "get", signal: request.signal });
      const redis = await connect();
      const pattern = `${cacheId}:*${redisPattern(request.search ?? "")}*`;
      const [nextCursor, keys] = await redis.scan(request.cursor ?? "0", pattern, request.limit);
      const items = await Promise.all(
        keys.slice(0, request.limit).map(async (key) => ({
          key: key.slice(cacheId.length + 1),
          type: await redis.type(key),
          ttlMs: normalizeTtl(await redis.ttl(key)),
          bytes: new TextEncoder().encode((await redis.get(key)) ?? "").byteLength,
        })),
      );
      return { items, ...(nextCursor === "0" ? {} : { nextCursor }) };
    },
    value: async (request) => {
      check({ operation: "get", signal: request.signal });
      const redis = await connect();
      const key = `${cacheId}:${request.key}`;
      const value = await redis.get(key);
      if (value === null) return undefined;
      const bytes = new TextEncoder().encode(value).byteLength;
      return {
        key: request.key,
        type: await redis.type(key),
        ttlMs: normalizeTtl(await redis.ttl(key)),
        bytes,
        ...(bytes > request.limit
          ? { truncated: true }
          : { value: JSON.parse(value), truncated: false }),
      };
    },
  });
}

function redisPattern(value: string): string {
  return value.replace(/[\\*?\[\]]/g, "\\$&");
}

function normalizeTtl(value: number): number | null {
  return value < 0 ? null : value;
}

function check(context: CacheOperationContext | undefined): void {
  if (context?.signal.aborted)
    throw context.signal.reason ?? new Error("Cache operation cancelled");
}
