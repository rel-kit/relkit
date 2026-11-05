/** Bun's built-in `Bun.RedisClient`, with reconnection and the offline queue turned off. */
import type { OpenRedisNative } from "./redis-native.types.js";

/** Opens a Bun-native Redis connection. */
export const openBunRedis: OpenRedisNative = (options) => {
  const client = new Bun.RedisClient(options.url, {
    tls: options.tls,
    autoReconnect: false,
    enableOfflineQueue: false,
    ...(options.connectionTimeoutMs === undefined
      ? {}
      : { connectionTimeout: options.connectionTimeoutMs }),
  });
  client.onclose = () => options.onClose();
  return {
    get connected() {
      return client.connected;
    },
    connect: () => client.connect(),
    close: () => client.close(),
    send: (command, args) => client.send(command, [...args]),
  };
};
