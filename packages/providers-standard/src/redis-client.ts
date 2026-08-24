import { RedisClient } from "bun";

export interface StandardRedisClientOptions {
  readonly url: string;
  readonly connectionTimeoutMs?: number;
}

export interface StandardRedisClient {
  readonly connected: boolean;
  connect(): Promise<void>;
  close(): void;
  ping(): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<number>;
  has(key: string): Promise<boolean>;
  increment(key: string, amount?: number): Promise<number>;
}

export function createRedisClient(options: StandardRedisClientOptions): StandardRedisClient {
  const url = validateUrl(options.url);
  if (
    options.connectionTimeoutMs !== undefined &&
    (!Number.isSafeInteger(options.connectionTimeoutMs) || options.connectionTimeoutMs < 1)
  ) {
    throw new RangeError("Redis connectionTimeoutMs must be a positive integer");
  }
  const client = new RedisClient(url, {
    tls: url.startsWith("rediss://"),
    ...(options.connectionTimeoutMs === undefined
      ? {}
      : { connectionTimeout: options.connectionTimeoutMs }),
  });
  return {
    get connected() {
      return client.connected;
    },
    connect: () => client.connect(),
    close: () => client.close(),
    ping: async () => String(await client.send("PING", [])) === "PONG",
    get: (key) => client.get(key),
    set: async (key, value, ttlMs) => {
      if (ttlMs === undefined) await client.set(key, value);
      else {
        if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) {
          throw new RangeError("Redis ttlMs must be a positive integer");
        }
        await client.set(key, value, "PX", ttlMs);
      }
    },
    delete: (key) => client.del(key),
    has: (key) => client.exists(key),
    increment: (key, amount = 1) => {
      if (!Number.isSafeInteger(amount)) throw new RangeError("Redis increment must be an integer");
      return client.incrby(key, amount);
    },
  };
}

function validateUrl(value: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError("Redis URL must not be empty");
  }
  const url = new URL(value);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new TypeError("Redis URL must use redis:// or rediss://");
  }
  return value;
}
