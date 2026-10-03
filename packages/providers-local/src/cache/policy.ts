import {
  CacheOperationCancelledError,
  CacheOperationTimeoutError,
  type CacheOperationContext,
} from "@relkit/cache";
import {
  LocalCachePolicyError,
  LocalCacheStateError,
  type LocalCachePolicy,
  type LocalCacheProviderOptions,
} from "./types.js";

/**
 * Validates provider limits and normalizes effective policy defaults.
 * @param options - Caller policy, pagination or construction settings.
 * @returns An immutable validated provider policy.
 */
export function normalizePolicy(options: LocalCacheProviderOptions): LocalCachePolicy {
  const defaultTtlMs = positiveInteger(options.defaultTtlMs, "defaultTtlMs");
  const maxTtlMs = positiveInteger(options.maxTtlMs, "maxTtlMs");
  if (defaultTtlMs !== undefined && maxTtlMs !== undefined && defaultTtlMs > maxTtlMs) {
    throw new LocalCachePolicyError("Cache defaultTtlMs must not exceed maxTtlMs");
  }
  const maxEntries = positiveInteger(options.maxEntries ?? 1000, "maxEntries")!;
  const maxBytes = positiveInteger(options.maxBytes ?? 10 * 1024 * 1024, "maxBytes")!;
  if (options.evictionPolicy !== undefined && options.evictionPolicy !== "lru") {
    throw new LocalCachePolicyError("Cache evictionPolicy must be lru");
  }
  return Object.freeze({
    ...(defaultTtlMs === undefined ? {} : { defaultTtlMs }),
    ...(maxTtlMs === undefined ? {} : { maxTtlMs }),
    maxEntries,
    maxBytes,
    evictionPolicy: "lru" as const,
  });
}

/**
 * Resolves entry TTL against defaults and the maximum allowed lifetime.
 * @param value - Candidate value to validate, normalize or encode.
 * @param policy - Validated effective provider policy.
 * @returns The validated TTL in milliseconds, when configured.
 */
export function normalizeTtl(value: unknown, policy: LocalCachePolicy): number | undefined {
  const ttlMs = value === undefined ? policy.defaultTtlMs : value;
  if (ttlMs === undefined) return undefined;
  if (typeof ttlMs !== "number" || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new LocalCachePolicyError("Cache ttlMs must be a positive integer");
  }
  if (policy.maxTtlMs !== undefined && ttlMs > policy.maxTtlMs) {
    throw new LocalCachePolicyError("Cache ttlMs exceeds the configured maximum");
  }
  return ttlMs;
}

/**
 * Rejects an aborted or expired operation before cache or bucket IO.
 * @param context - Caller cancellation, deadline and operation metadata.
 * @param clock - Injected clock used for TTL and deadline checks.
 * @returns The checked clock time when used by the cache, otherwise nothing.
 */
export function assertActive(
  context: CacheOperationContext | undefined,
  clock: () => number,
): number {
  if (context?.signal.aborted) throw new CacheOperationCancelledError();
  const now = readClock(clock);
  if (context?.deadlineMs !== undefined && context.deadlineMs <= now) {
    throw new CacheOperationTimeoutError();
  }
  return now;
}

/**
 * Checks that the injected clock returns a usable finite timestamp.
 * @param clock - Injected clock used for TTL and deadline checks.
 * @returns The current provider time in milliseconds.
 */
export function readClock(clock: () => number): number {
  const now = clock();
  if (typeof now !== "number" || !Number.isFinite(now)) {
    throw new LocalCacheStateError("Cache clock must return a finite number");
  }
  return now;
}

/**
 * Measures UTF-8 bytes for cache key and value capacity accounting.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns The encoded byte length.
 */
export function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * Copies cache values through their supported JSON representation.
 * @param value - Candidate value to validate, normalize or encode.
 * @returns An isolated copy of the stored value.
 */
export function clone(value: unknown): unknown {
  return structuredClone(value);
}

/**
 * Requires a positive safe integer for a named policy limit.
 * @param value - Candidate value to validate, normalize or encode.
 * @param name - Policy field used in validation errors.
 * @returns The validated integer.
 */
function positiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new LocalCachePolicyError(`Cache ${name} must be a positive integer`);
  }
  return value;
}
