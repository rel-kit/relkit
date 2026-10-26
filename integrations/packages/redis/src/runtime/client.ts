/** Owns the native Redis connection; a later operation can reconnect without replaying failed commands. */
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

/** Maps the existing protocol to the currently owned socket without retrying commands.
 * @param connection - Native socket lifecycle. @returns The Redis protocol adapter. */
function protocolClient(connection: ReturnType<typeof redisConnection>): RedisProtocolClient {
  return {
    get connected() {
      return connection.connected;
    },
    connect: connection.connect,
    close: connection.close,
    ping: async () => String(await connection.client.send("PING", [])) === "PONG",
    get: (key) => connection.client.get(key),
    set: async (key, value, ttlMs) => {
      if (ttlMs === undefined) await connection.client.set(key, value);
      else {
        if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) {
          throw new RangeError("Redis ttlMs must be a positive integer");
        }
        await connection.client.set(key, value, "PX", ttlMs);
      }
    },
    delete: (key) => connection.client.del(key),
    has: (key) => connection.client.exists(key),
    increment: (key, amount = 1) => {
      if (!Number.isSafeInteger(amount)) throw new RangeError("Redis increment must be an integer");
      return connection.client.incrby(key, amount);
    },
    scan: async (cursor, pattern, count) => {
      const result = await connection.client.send("SCAN", [
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        String(count),
      ]);
      if (!Array.isArray(result) || result.length !== 2 || !Array.isArray(result[1])) {
        throw new Error("Redis SCAN returned an invalid response");
      }
      return [String(result[0]), result[1].map(String)];
    },
    type: async (key) => String(await connection.client.send("TYPE", [key])),
    ttl: async (key) => Number(await connection.client.send("PTTL", [key])),
    command: (command, args) => connection.client.send(command, [...args]),
  };
}

/** Replaces closed native clients because Bun 1.3.10 can reconnect a socket while commands stay closed.
 * @param url - Validated Redis URL. @param timeout - Optional connection timeout in milliseconds.
 * @returns One shared connection attempt and terminal explicit shutdown. */
function redisConnection(url: string, timeout: number | undefined) {
  let closed = false;
  let disconnected = false;
  let pending: Promise<void> | undefined;
  const open = () => {
    const next = new Bun.RedisClient(url, {
      tls: url.startsWith("rediss://"),
      autoReconnect: false,
      enableOfflineQueue: false,
      ...(timeout === undefined ? {} : { connectionTimeout: timeout }),
    });
    next.onclose = () => {
      if (client === next) disconnected = true;
    };
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
