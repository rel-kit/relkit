import type { CacheOperationContext, CacheOperationOptions, CacheProvider } from "@relkit/cache";
import { canonicalJson } from "@relkit/contracts";

export interface CloudflareKvCacheOptions {
  readonly accountId: string;
  readonly namespaceId: string;
  readonly apiToken: string;
  readonly cacheId: string;
  readonly fetch?: typeof globalThis.fetch;
}

export interface CloudflareKvCacheProvider extends CacheProvider {
  readonly ready: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export function createCloudflareKvCacheProvider(
  options: CloudflareKvCacheOptions,
): CloudflareKvCacheProvider {
  const accountId = required(options.accountId, "accountId");
  const namespaceId = required(options.namespaceId, "namespaceId");
  const token = required(options.apiToken, "apiToken");
  const cacheId = required(options.cacheId, "cacheId");
  const fetcher = options.fetch ?? globalThis.fetch;
  const root = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}`;
  const flights = new Map<string, Promise<unknown>>();
  let closed = false;
  const encoded = (key: unknown): string => {
    const value = `${cacheId}:${canonicalJson(key)}`;
    if (new TextEncoder().encode(value).byteLength > 512)
      throw new RangeError("Cloudflare KV key exceeds 512 bytes");
    return value;
  };
  const request = async (
    path: string,
    init: RequestInit = {},
    context?: CacheOperationContext,
  ): Promise<Response> => {
    if (closed) throw new Error("Cloudflare KV cache provider is closed");
    if (context?.signal.aborted)
      throw context.signal.reason ?? new Error("Cache operation cancelled");
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetcher(`${root}${path}`, {
      ...init,
      headers,
      ...(context === undefined ? {} : { signal: context.signal }),
    });
  };
  const get = async (key: unknown, context?: CacheOperationContext): Promise<unknown> => {
    const response = await request(`/values/${encodeURIComponent(encoded(key))}`, {}, context);
    if (response.status === 404) return undefined;
    await assertResponse(response, "Cloudflare KV get");
    return JSON.parse(await response.text());
  };
  const set = async (
    key: unknown,
    value: unknown,
    settings?: CacheOperationOptions,
    context?: CacheOperationContext,
  ): Promise<void> => {
    const url = new URL(`${root}/values/${encodeURIComponent(encoded(key))}`);
    if (settings?.ttlMs !== undefined) {
      if (settings.ttlMs < 60_000)
        throw new RangeError("Cloudflare KV ttlMs must be at least 60000");
      url.searchParams.set("expiration_ttl", String(Math.ceil(settings.ttlMs / 1_000)));
    }
    const response = await request(
      url.toString().slice(root.length),
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: canonicalJson(value),
      },
      context,
    );
    await assertResponse(response, "Cloudflare KV set");
  };
  const remove = async (key: unknown, context?: CacheOperationContext): Promise<void> => {
    const response = await request(
      `/values/${encodeURIComponent(encoded(key))}`,
      { method: "DELETE" },
      context,
    );
    await assertResponse(response, "Cloudflare KV delete");
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
    const active = flights.get(cacheKey);
    if (active !== undefined) return active;
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
  return Object.freeze({
    capabilities: Object.freeze({ increment: false }),
    get,
    set,
    delete: remove,
    has: async (key: unknown, context?: CacheOperationContext) =>
      (await get(key, context)) !== undefined,
    getOrSet,
    ready: async () => {
      await assertResponse(await request(""), "Cloudflare KV readiness");
    },
    close: async () => {
      closed = true;
      flights.clear();
    },
  });
}

async function assertResponse(response: Response, operation: string): Promise<void> {
  if (response.ok) return;
  const text = (await response.text()).trim().replace(/\s+/g, " ").slice(0, 500);
  throw new Error(`${operation} failed with status ${response.status}${text ? `: ${text}` : ""}`);
}

function required(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`Cloudflare KV ${name} is invalid`);
  return value.trim();
}
