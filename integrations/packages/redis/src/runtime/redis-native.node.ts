/** `ioredis` on Node, configured like Bun's client: no retries, no offline queue, lazy connect. */
import { Redis } from "ioredis";
import type { OpenRedisNative } from "./redis-native.types.js";

/** Opens an `ioredis` connection. */
export const openNodeRedis: OpenRedisNative = (options) => {
  const client = new Redis(options.url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    ...(options.tls && !options.url.startsWith("rediss://") ? { tls: {} } : {}),
    ...(options.connectionTimeoutMs === undefined
      ? {}
      : { connectTimeout: options.connectionTimeoutMs }),
  });
  // Failures reach callers through rejected commands; an unhandled "error" event would crash Node.
  client.on("error", () => undefined);
  client.once("end", () => options.onClose());
  return {
    get connected() {
      return client.status === "ready";
    },
    connect: () => client.connect(),
    close: () => client.disconnect(false),
    send: (command, args) => client.call(command, ...args),
  };
};
