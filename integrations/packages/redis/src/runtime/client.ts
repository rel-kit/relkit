export interface RedisClientOptions {
  readonly url: string;
  readonly connectionTimeoutMs?: number;
}

export interface RedisProtocolClient {
  readonly connected: boolean;
  connect(): Promise<void>;
  close(): void;
  ping(): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<number>;
  has(key: string): Promise<boolean>;
  increment(key: string, amount?: number): Promise<number>;
  scan(
    cursor: string,
    pattern: string,
    count: number,
  ): Promise<readonly [string, readonly string[]]>;
  type(key: string): Promise<string>;
  ttl(key: string): Promise<number>;
}

export function createRedisClient(options: RedisClientOptions): RedisProtocolClient {
  const url = validateUrl(options.url);
  if (
    options.connectionTimeoutMs !== undefined &&
    (!Number.isSafeInteger(options.connectionTimeoutMs) || options.connectionTimeoutMs < 1)
  ) {
    throw new RangeError("Redis connectionTimeoutMs must be a positive integer");
  }
  const client = new Bun.RedisClient(url, {
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
    scan: async (cursor, pattern, count) => {
      const result = await client.send("SCAN", [cursor, "MATCH", pattern, "COUNT", String(count)]);
      if (!Array.isArray(result) || result.length !== 2 || !Array.isArray(result[1])) {
        throw new Error("Redis SCAN returned an invalid response");
      }
      return [String(result[0]), result[1].map(String)];
    },
    type: async (key) => String(await client.send("TYPE", [key])),
    ttl: async (key) => Number(await client.send("PTTL", [key])),
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
