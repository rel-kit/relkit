import {
  createRedisCacheProvider,
  type RedisProtocolClient,
} from "../../integrations/packages/redis/src/runtime/index.ts";
import { registerCacheContractSuite, type CacheContractTarget } from "./cache.ts";

const redis: CacheContractTarget = {
  name: "Redis integration",
  features: { eviction: false, failureInjection: false },
  create: async () => {
    let now = 0;
    const client = memoryRedisClient(() => now);
    const provider = createRedisCacheProvider({
      url: "redis://127.0.0.1:6379",
      cacheId: "contract",
      client,
    });
    await provider.ready();
    return {
      provider,
      advance: async (milliseconds) => {
        now += milliseconds;
      },
      safeView: () => ({ connected: client.connected }),
      close: provider.close,
    };
  },
};

registerCacheContractSuite(redis);

function memoryRedisClient(now: () => number): RedisProtocolClient {
  const values = new Map<string, { value: string; expiresAt?: number }>();
  let connected = false;
  const read = (key: string) => {
    const entry = values.get(key);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= now()) {
      values.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    get connected() {
      return connected;
    },
    connect: async () => {
      connected = true;
    },
    close: () => {
      connected = false;
    },
    ping: async () => true,
    get: async (key) => read(key)?.value ?? null,
    set: async (key, value, ttlMs) => {
      values.set(key, {
        value,
        ...(ttlMs === undefined ? {} : { expiresAt: now() + ttlMs }),
      });
    },
    delete: async (key) => (values.delete(key) ? 1 : 0),
    has: async (key) => read(key) !== undefined,
    increment: async (key, amount = 1) => {
      const value = Number(read(key)?.value ?? "0") + amount;
      values.set(key, { value: String(value) });
      return value;
    },
    scan: async (_cursor, pattern, count) => {
      const search = pattern.replaceAll("*", "").replaceAll("\\", "");
      const keys = [...values.keys()].filter((key) => {
        read(key);
        return values.has(key) && key.includes(search);
      });
      return ["0", keys.slice(0, count)];
    },
    type: async (key) => (read(key) === undefined ? "none" : "string"),
    ttl: async (key) => {
      const entry = read(key);
      if (entry === undefined) return -2;
      return entry.expiresAt === undefined ? -1 : Math.max(0, entry.expiresAt - now());
    },
  };
}
