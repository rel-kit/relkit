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

export function readClock(clock: () => number): number {
  const now = clock();
  if (typeof now !== "number" || !Number.isFinite(now)) {
    throw new LocalCacheStateError("Cache clock must return a finite number");
  }
  return now;
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function clone(value: unknown): unknown {
  return structuredClone(value);
}

function positiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new LocalCachePolicyError(`Cache ${name} must be a positive integer`);
  }
  return value;
}
