import { RedisClient } from "bun";

export interface ZsysValkeyClientOptions {
  readonly url: string;
  readonly tls?: boolean;
  readonly connectionTimeoutMs?: number;
}

/** Promise-only cache operations backed by Bun's native RedisClient. */
export interface ZsysValkeyClient {
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

/** Creates a private native Valkey client without exporting its Bun type. */
export function createValkeyClient(options: ZsysValkeyClientOptions): ZsysValkeyClient {
  if (options.url.trim() === "") throw new TypeError("Valkey URL must not be empty.");
  if (
    options.connectionTimeoutMs !== undefined &&
    (!Number.isSafeInteger(options.connectionTimeoutMs) || options.connectionTimeoutMs < 1)
  )
    throw new RangeError("Valkey connectionTimeoutMs must be a positive integer.");
  const client = new RedisClient(options.url, {
    tls: options.tls ?? options.url.startsWith("rediss://"),
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
      if (ttlMs === undefined) {
        await client.set(key, value);
      } else {
        if (!Number.isSafeInteger(ttlMs) || ttlMs < 1)
          throw new RangeError("Valkey ttlMs must be a positive integer.");
        await client.set(key, value, "PX", ttlMs);
      }
    },
    delete: (key) => client.del(key),
    has: (key) => client.exists(key),
    increment: (key, amount = 1) => {
      if (!Number.isSafeInteger(amount))
        throw new RangeError("Valkey increment must be an integer.");
      return client.incrby(key, amount);
    },
  };
}
