import type {
  CacheCapabilities,
  CacheOperationContext,
  CacheOperationOptions,
  CacheProvider,
} from "@zsys/cache";

export const LOCAL_CACHE_CAPABILITIES = Object.freeze({
  increment: true,
  persistence: "memory-only",
  singleFlight: "generation-local",
} as const);

export const LOCAL_CACHE_DURABLE_CAPABILITIES = Object.freeze({
  increment: true,
  persistence: "restart-recovery",
  singleFlight: "generation-local",
} as const);

export type LocalCacheEvictionPolicy = "lru";

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

export interface LocalCachePolicy {
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
  readonly maxEntries: number;
  readonly maxBytes: number;
  readonly evictionPolicy: LocalCacheEvictionPolicy;
}

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

export interface LocalCacheCapabilities extends CacheCapabilities {
  readonly persistence: "memory-only" | "restart-recovery";
  readonly singleFlight: "generation-local";
}

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

export class LocalCacheKeyError extends TypeError {
  readonly code = "ZSYS_CACHE_KEY_INVALID" as const;

  constructor() {
    super("Cache key must be canonical JSON data");
    this.name = "LocalCacheKeyError";
  }
}

export class LocalCacheValueError extends TypeError {
  readonly code = "ZSYS_CACHE_VALUE_INVALID" as const;

  constructor() {
    super("Cache value must be canonical JSON data");
    this.name = "LocalCacheValueError";
  }
}

export class LocalCachePolicyError extends RangeError {
  readonly code = "ZSYS_CACHE_POLICY_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "LocalCachePolicyError";
  }
}

export class LocalCacheStateError extends Error {
  readonly code = "ZSYS_CACHE_STATE_INVALID" as const;

  constructor(message = "Cache provider state is invalid") {
    super(message);
    this.name = "LocalCacheStateError";
  }
}
