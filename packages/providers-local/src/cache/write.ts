import type { CacheOperationOptions } from "@relkit/cache";
import { serializeLocalCacheValue } from "./keys.js";
import { byteLength, normalizeTtl } from "./policy.js";
import type { LocalCacheStore } from "./store.js";
import { LocalCachePolicyError, type LocalCachePolicy } from "./types.js";

/**
 * Validates and clones a value before enforcing byte-LRU and TTL policy.
 * @param store - Provider-owned byte-LRU state.
 * @param policy - Validated effective provider policy.
 * @param encoded - Canonical namespaced cache key.
 * @param value - Candidate value to validate, normalize or encode.
 * @param options - Caller policy, pagination or construction settings.
 * @param now - Current time used for TTL and deadline decisions.
 * @returns Nothing after insertion or the existing policy/value error.
 */
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
