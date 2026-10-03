import type { MISSING } from "./store.js";

/** Mutable LRU entry with encoded-byte accounting and recency sequence. */
export interface Entry {
  readonly key: string;
  readonly value: unknown;
  readonly bytes: number;
  readonly expiresAt?: number;
  lastUsed: number;
}

/** Cache read result distinguishing absence from an expired value. */
export interface LocalCacheRead {
  readonly value: unknown | typeof MISSING;
  readonly expired: boolean;
}

/** Safe counters maintained by the pure LRU state. */
export interface LocalCacheStoreSnapshot {
  readonly entries: number;
  readonly bytes: number;
  readonly evictions: number;
  readonly hits: number;
  readonly misses: number;
}

/** Serializable cache entry including expiration and recency metadata. */
export interface LocalCacheStoreEntry {
  readonly key: string;
  readonly value: unknown;
  readonly bytes: number;
  readonly expiresAt?: number;
  readonly lastUsed: number;
}

/** Complete cache snapshot used to restore counters and LRU ordering. */
export interface LocalCacheStoreState extends Omit<LocalCacheStoreSnapshot, "entries"> {
  readonly sequence: number;
  readonly entries: readonly LocalCacheStoreEntry[];
}
