/** Owns the native Redis connection; a later operation can reconnect without replaying failed commands. */
import { openBunRedis } from "./redis-native.bun.js";
import { openNodeRedis } from "./redis-native.node.js";
import type { RedisNativeClient } from "./redis-native.types.js";

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
  command(command: string, args: readonly string[]): Promise<unknown>;
}

/** Creates a protocol client whose next connection attempt replaces a failed native socket.
 * @param options - Redis endpoint and optional positive connection timeout.
 * @returns Explicitly connected client; close is permanent and failed commands are never replayed. */
export function createRedisClient(options: RedisClientOptions): RedisProtocolClient {
  const url = validateUrl(options.url);
  if (
    options.connectionTimeoutMs !== undefined &&
    (!Number.isSafeInteger(options.connectionTimeoutMs) || options.connectionTimeoutMs < 1)
  ) {
    throw new RangeError("Redis connectionTimeoutMs must be a positive integer");
  }
  return protocolClient(redisConnection(url, options.connectionTimeoutMs));
}

/** Maps the protocol to raw commands on the currently owned socket without retrying them.
 * @param connection - Native socket lifecycle. @returns The Redis protocol adapter. */
function protocolClient(connection: ReturnType<typeof redisConnection>): RedisProtocolClient {
  const send = (command: string, args: readonly string[]) => connection.client.send(command, args);
  return {
    get connected() {
      return connection.connected;
    },
    connect: connection.connect,
    close: connection.close,
    ping: async () => String(await send("PING", [])) === "PONG",
    get: async (key) => {
      const value = await send("GET", [key]);
      return value === null || value === undefined ? null : String(value);
    },
    set: async (key, value, ttlMs) => {
      if (ttlMs === undefined) await send("SET", [key, value]);
      else {
        if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) {
          throw new RangeError("Redis ttlMs must be a positive integer");
        }
        await send("SET", [key, value, "PX", String(ttlMs)]);
      }
    },
    delete: async (key) => Number(await send("DEL", [key])),
    has: async (key) => Number(await send("EXISTS", [key])) > 0,
    increment: async (key, amount = 1) => {
      if (!Number.isSafeInteger(amount)) throw new RangeError("Redis increment must be an integer");
      return Number(await send("INCRBY", [key, String(amount)]));
    },
    scan: async (cursor, pattern, count) => {
      const result = await send("SCAN", [cursor, "MATCH", pattern, "COUNT", String(count)]);
      if (!Array.isArray(result) || result.length !== 2 || !Array.isArray(result[1])) {
        throw new Error("Redis SCAN returned an invalid response");
      }
      return [String(result[0]), result[1].map(String)];
    },
    type: async (key) => String(await send("TYPE", [key])),
    ttl: async (key) => Number(await send("PTTL", [key])),
    command: (command, args) => send(command, args),
  };
}

/** Replaces closed native clients because Bun 1.3.10 can reconnect a socket while commands stay closed;
 * Node uses `ioredis` with the same no-retry policy.
 * @param url - Validated Redis URL. @param timeout - Optional connection timeout in milliseconds.
 * @returns One shared connection attempt and terminal explicit shutdown. */
function redisConnection(url: string, timeout: number | undefined) {
  let closed = false;
  let disconnected = false;
  let pending: Promise<void> | undefined;
  const openNative = typeof process.versions.bun === "string" ? openBunRedis : openNodeRedis;
  const open = (): RedisNativeClient => {
    const next: RedisNativeClient = openNative({
      url,
      tls: url.startsWith("rediss://"),
      connectionTimeoutMs: timeout,
      onClose: () => {
        if (client === next) disconnected = true;
      },
    });
    return next;
  };
  let client = open();
  return {
    get client() {
      return client;
    },
    get connected() {
      return !closed && !disconnected && client.connected;
    },
    async connect() {
      if (closed) throw new Error("Redis client is closed.");
      if (pending) return pending;
      if (disconnected) {
        client.close();
        client = open();
        disconnected = false;
      }
      pending = client
        .connect()
        .catch((error) => {
          disconnected = true;
          throw error;
        })
        .finally(() => {
          pending = undefined;
        });
      return pending;
    },
    close() {
      closed = true;
      client.close();
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
