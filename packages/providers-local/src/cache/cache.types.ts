import type {
  CacheCapabilities,
  CacheOperationContext,
  CacheOperationOptions,
  CacheProvider,
} from "@relkit/cache";

/** Eviction policy supported by the bounded in-memory cache. */
export type LocalCacheEvictionPolicy = "lru";

/** Cache bounds, persistence, clock and safe observation hooks. */
export interface LocalCacheProviderOptions {
  /** Provider-owned profile directory; enables atomic restart snapshots. */
  readonly stateRoot?: string;
  readonly cacheId?: string;
  readonly schemaVersion?: string | number;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
  readonly maxEntries?: number;
  readonly maxBytes?: number;
  readonly evictionPolicy?: LocalCacheEvictionPolicy;
  /** Injectable clock used for TTL and deadline checks. */
  readonly clock?: () => number;
  /** Alias for clock, kept for small deterministic test seams. */
  readonly now?: () => number;
  /** Receives safe counters only; keys and values are never included. */
  readonly onSnapshot?: (snapshot: LocalCacheSnapshot) => void;
}

/** Normalized TTL, encoded-value and total-cache limits. */
export interface LocalCachePolicy {
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
  readonly maxEntries: number;
  readonly maxBytes: number;
  readonly evictionPolicy: LocalCacheEvictionPolicy;
}

/** Safe cache counters and effective policy without keys or values. */
export interface LocalCacheSnapshot {
  readonly version: 1;
  readonly cacheId: string;
  readonly schemaVersion: string | number;
  readonly entries: number;
  readonly bytes: number;
  readonly evictions: number;
  readonly hits: number;
  readonly misses: number;
  readonly inFlight: number;
}

/** Truthful persistence, atomicity and capacity guarantees for the local cache. */
export interface LocalCacheCapabilities extends CacheCapabilities {
  readonly persistence: "memory-only" | "restart-recovery";
  readonly singleFlight: "generation-local";
}

/** Public cache operations and local lifecycle/inspection surface. */
export type LocalCacheProvider = Omit<CacheProvider, "capabilities"> & {
  readonly capabilities: Readonly<LocalCacheCapabilities>;
  readonly cacheId: string;
  readonly schemaVersion: string | number;
  readonly policy: Readonly<LocalCachePolicy>;
  readonly snapshot: () => LocalCacheSnapshot;
  readonly stateRoot?: string;
  readonly ready: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly get: (key: unknown, context?: CacheOperationContext) => Promise<unknown | undefined>;
  readonly set: (
    key: unknown,
    value: unknown,
    options?: CacheOperationOptions,
    context?: CacheOperationContext,
  ) => Promise<void>;
  readonly delete: (key: unknown, context?: CacheOperationContext) => Promise<void>;
  readonly has: (key: unknown, context?: CacheOperationContext) => Promise<boolean>;
  readonly getOrSet: (
    key: unknown,
    produce: () => unknown | Promise<unknown>,
    options?: CacheOperationOptions,
    context?: CacheOperationContext,
  ) => Promise<unknown>;
  readonly increment: (
    key: unknown,
    delta: number,
    options?: CacheOperationOptions,
    context?: CacheOperationContext,
  ) => Promise<number>;
  readonly inspector: {
    readonly scan: (request: {
      readonly search?: string;
      readonly cursor?: string;
      readonly limit: number;
      readonly signal: AbortSignal;
    }) => Promise<{ readonly items: readonly unknown[]; readonly nextCursor?: string }>;
    readonly value: (request: {
      readonly key: string;
      readonly limit: number;
      readonly signal: AbortSignal;
    }) => Promise<unknown | undefined>;
  };
};
