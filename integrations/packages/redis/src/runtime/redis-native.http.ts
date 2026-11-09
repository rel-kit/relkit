/**
 * Redis over HTTP, for runtimes without raw TCP such as Cloudflare Workers. Each command is one
 * `fetch` POST of the JSON array `[command, ...args]` to the endpoint, answered with `{ result }` or
 * `{ error }`: the REST protocol Upstash Redis and compatible proxies serve. The URL carries the
 * access token as its password (`https://:<token>@host`); the client sends it as a bearer token and
 * never puts it in the request URL. There is no socket: `connect` sends one `PING`, and blocking or
 * subscribing commands are not supported.
 */
import type { OpenRedisNative, RedisNativeClient } from "./redis-native.types.js";

/** Parsed HTTP endpoint. */
interface RedisHttpEndpoint {
  readonly url: string;
  readonly token: string | undefined;
}

/**
 * Splits the token out of an HTTP Redis URL.
 * @param value - `http://` or `https://` URL, optionally with the token as its password.
 * @returns The request URL without credentials, and the token.
 */
export function redisHttpEndpoint(value: string): RedisHttpEndpoint {
  const url = new URL(value);
  const token = decodeURIComponent(url.password || url.username) || undefined;
  url.username = "";
  url.password = "";
  return { url: url.toString(), token };
}

/** Opens an HTTP Redis client; `connect` checks the endpoint with `PING`. */
export const openHttpRedis: OpenRedisNative = (options) => {
  const endpoint = redisHttpEndpoint(options.url);
  let connected = false;
  let closed = false;
  const controllers = new Set<AbortController>();
  const send = async (command: string, args: readonly string[]): Promise<unknown> => {
    if (closed) throw new Error("Redis client is closed.");
    const controller = new AbortController();
    controllers.add(controller);
    const timer =
      options.connectionTimeoutMs === undefined
        ? undefined
        : setTimeout(() => controller.abort(), options.connectionTimeoutMs);
    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(endpoint.token === undefined ? {} : { authorization: `Bearer ${endpoint.token}` }),
        },
        body: JSON.stringify([command, ...args]),
        signal: controller.signal,
      });
      const text = await response.text();
      let body: { readonly result?: unknown; readonly error?: unknown };
      try {
        body = JSON.parse(text) as typeof body;
      } catch {
        throw new Error(`Redis HTTP ${command} failed with status ${response.status}`);
      }
      if (typeof body.error === "string") throw new Error(body.error);
      if (!response.ok)
        throw new Error(`Redis HTTP ${command} failed with status ${response.status}`);
      return body.result ?? null;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      controllers.delete(controller);
    }
  };
  const client: RedisNativeClient = {
    get connected() {
      return connected && !closed;
    },
    async connect() {
      if (String(await send("PING", [])) !== "PONG")
        throw new Error("Redis HTTP endpoint did not answer PING.");
      connected = true;
    },
    close() {
      if (closed) return;
      closed = true;
      for (const controller of controllers) controller.abort();
      options.onClose();
    },
    send,
  };
  return client;
};
