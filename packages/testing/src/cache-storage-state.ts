import { Ref } from "effect";
import {
  CacheOperationCancelledError,
  CacheOperationTimeoutError,
  type CacheOperationContext,
  type CacheOperationOptions,
} from "@relkit/cache";
import { canonicalJson } from "@relkit/contracts";
import type { CacheEntry, CacheStorageState, CacheStoragePolicy } from "./cache-storage.types.js";

/**
 * Binds native cache validation and committed mutations to one authoritative Ref.
 * @param state Owner-local entries, single-flight registry and admission state.
 * @param policy Validated identity, clock, TTL and failure-injection authority.
 * @returns Atomic cache decisions shared by native provider workflows.
 */
export function cacheStorageOperations(
  state: Ref.Ref<CacheStorageState>,
  policy: CacheStoragePolicy,
) {
  const { cacheId, schemaVersion, clock, failures, defaultTtlMs, maxTtlMs } = policy;

  /**
   * Reads the authoritative state while enforcing write admission.
   * @returns Open owner state or the established closed error.
   */
  function open() {
    const value = Ref.getUnsafe(state);
    if (value.closed) throw new Error("Test cache is closed");
    return value;
  }

  /**
   * Canonicalizes a native key with the owning cache identity and version.
   * @param key Native JSON cache key.
   * @returns Canonical owner/version-specific identity.
   */
  function keyOf(key: unknown): string {
    try {
      return canonicalJson({ cacheId, key, schemaVersion });
    } catch {
      throw new TypeError("Cache key must be canonical JSON data");
    }
  }

  /**
   * Validates native cancellation and the absolute deadline before mutation.
   * @param context Cancellation and absolute deadline.
   * @returns Current injected time.
   */
  function active(context: CacheOperationContext | undefined): number {
    if (context?.signal.aborted) throw new CacheOperationCancelledError();
    const now = clock();
    if (!Number.isFinite(now)) throw new TypeError("Cache clock must return a finite number");
    if (context?.deadlineMs !== undefined && context.deadlineMs <= now)
      throw new CacheOperationTimeoutError();
    return now;
  }

  /**
   * Removes an expired entry before returning authoritative native state.
   * @param key Native JSON cache key.
   * @param context Native execution deadline and cancellation.
   * @returns Unexpired stored entry, or undefined for a miss.
   */
  function readEntry(
    key: unknown,
    context: CacheOperationContext | undefined,
  ): CacheEntry | undefined {
    const encoded = keyOf(key);
    const now = active(context);
    const entries = open().entries;
    const entry = entries.get(encoded);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= now) {
      entries.delete(encoded);
      return undefined;
    }
    return entry;
  }

  /**
   * Commits detached canonical JSON after validating native TTL policy.
   * @param key Native key.
   * @param value Value serialized through the native canonical JSON authority.
   * @param write Per-write TTL override.
   * @param context Native deadline and cancellation.
   * @returns Nothing after commit; the post-write failure point follows mutation.
   */
  function writeEntry(
    key: unknown,
    value: unknown,
    write: CacheOperationOptions | undefined,
    context: CacheOperationContext | undefined,
  ): void {
    const entries = open().entries;
    const encoded = keyOf(key);
    const serialized = canonicalJson(value);
    const now = active(context);
    const ttlMs = write?.ttlMs ?? defaultTtlMs;
    if (ttlMs !== undefined && (ttlMs <= 0 || !Number.isSafeInteger(ttlMs)))
      throw new RangeError("Cache ttlMs must be a positive integer");
    if (maxTtlMs !== undefined && ttlMs !== undefined && ttlMs > maxTtlMs)
      throw new RangeError("Cache ttlMs exceeds the configured maximum");
    failures.check("cache.before-set");
    entries.set(encoded, {
      value: structuredClone(JSON.parse(serialized)),
      ...(ttlMs === undefined ? {} : { expiresAt: now + ttlMs }),
    });
    failures.check("cache.after-set-before-ack");
  }
  return { open, keyOf, active, readEntry, writeEntry };
}
