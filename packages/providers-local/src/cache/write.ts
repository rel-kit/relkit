import type { CacheOperationOptions } from "@zsys/cache";
import { serializeLocalCacheValue } from "./keys.js";
import { byteLength, normalizeTtl } from "./policy.js";
import type { LocalCacheStore } from "./store.js";
import { LocalCachePolicyError, type LocalCachePolicy } from "./types.js";

export function writeCacheEntry(
  store: LocalCacheStore,
  policy: LocalCachePolicy,
  encoded: string,
  value: unknown,
  options: CacheOperationOptions | undefined,
  now: number,
): void {
  const serialized = serializeLocalCacheValue(value);
  const stored = JSON.parse(serialized) as unknown;
  const bytes = byteLength(encoded) + byteLength(serialized);
  if (bytes > policy.maxBytes) throw new LocalCachePolicyError("Cache value exceeds maxBytes");
  const ttlMs = normalizeTtl(options?.ttlMs, policy);
  store.write(encoded, stored, bytes, ttlMs === undefined ? undefined : now + ttlMs);
}
