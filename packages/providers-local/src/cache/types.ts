import type {
  LocalCacheEvictionPolicy,
  LocalCacheProviderOptions,
  LocalCachePolicy,
  LocalCacheSnapshot,
  LocalCacheCapabilities,
  LocalCacheProvider,
} from "./cache.types.js";
export type {
  LocalCacheEvictionPolicy,
  LocalCacheProviderOptions,
  LocalCachePolicy,
  LocalCacheSnapshot,
  LocalCacheCapabilities,
  LocalCacheProvider,
} from "./cache.types.js";

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

/** Preserves the public local cache key error identity and stable error code. */
export class LocalCacheKeyError extends TypeError {
  readonly code = "RELKIT_CACHE_KEY_INVALID" as const;

  constructor() {
    super("Cache key must be canonical JSON data");
    this.name = "LocalCacheKeyError";
  }
}

/** Preserves the public local cache value error identity and stable error code. */
export class LocalCacheValueError extends TypeError {
  readonly code = "RELKIT_CACHE_VALUE_INVALID" as const;

  constructor() {
    super("Cache value must be canonical JSON data");
    this.name = "LocalCacheValueError";
  }
}

/** Preserves the public local cache policy error identity and stable error code. */
export class LocalCachePolicyError extends RangeError {
  readonly code = "RELKIT_CACHE_POLICY_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "LocalCachePolicyError";
  }
}

/** Preserves the public local cache state error identity and stable error code. */
export class LocalCacheStateError extends Error {
  readonly code = "RELKIT_CACHE_STATE_INVALID" as const;

  constructor(message = "Cache provider state is invalid") {
    super(message);
    this.name = "LocalCacheStateError";
  }
}
