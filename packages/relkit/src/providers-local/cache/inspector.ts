import { LocalCacheKeyError, type LocalCacheProvider } from "./types.js";
import type { LocalCacheStore } from "./store.js";

/**
 * Projects bounded cache metadata and previews from the same byte-LRU store.
 * @param store - Provider-owned byte-LRU state.
 * @param clock - Injected clock used for TTL and deadline checks.
 * @returns Read-only Promise inspector operations.
 */
export function createLocalCacheInspector(
  store: LocalCacheStore,
  clock: () => number,
): LocalCacheProvider["inspector"] {
  return Object.freeze({
    scan: async (request) => {
      if (request.signal.aborted) throw request.signal.reason;
      const now = clock();
      store.purgeExpired(now);
      const entries = store
        .exportState()
        .entries.map((entry) => ({ entry, key: publicKey(entry.key) }))
        .filter(({ key }) => request.search === undefined || key.includes(request.search));
      const start = request.cursor === undefined ? 0 : Number(request.cursor);
      if (!Number.isSafeInteger(start) || start < 0) throw new LocalCacheKeyError();
      const selected = entries.slice(start, start + request.limit);
      const next = start + selected.length;
      return {
        items: selected.map(({ entry, key }) => ({
          key,
          type: valueType(entry.value),
          ttlMs: entry.expiresAt === undefined ? null : Math.max(0, entry.expiresAt - now),
          bytes: entry.bytes,
        })),
        ...(next < entries.length ? { nextCursor: String(next) } : {}),
      };
    },
    value: async (request) => {
      if (request.signal.aborted) throw request.signal.reason;
      const now = clock();
      store.purgeExpired(now);
      const found = store
        .exportState()
        .entries.find((entry) => publicKey(entry.key) === request.key);
      if (found === undefined) return undefined;
      const serialized = JSON.stringify(found.value);
      const bytes = new TextEncoder().encode(serialized).byteLength;
      return {
        key: request.key,
        type: valueType(found.value),
        ttlMs: found.expiresAt === undefined ? null : Math.max(0, found.expiresAt - now),
        bytes,
        ...(bytes > request.limit ? { truncated: true } : { value: found.value, truncated: false }),
      };
    },
  });
}

/**
 * Removes the provider namespace from an encoded cache key for inspection.
 * @param encoded - Canonical namespaced cache key.
 * @returns The serialized application key.
 */
function publicKey(encoded: string): string {
  try {
    const value = JSON.parse(encoded) as { readonly key?: unknown };
    return JSON.stringify(value.key);
  } catch {
    throw new LocalCacheKeyError();
  }
}

/**
 * Classifies values for safe cache inspection metadata.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns A bounded public value-type label.
 */
function valueType(value: unknown): string {
  return value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
}
