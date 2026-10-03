import type {
  Entry,
  LocalCacheRead,
  LocalCacheStoreSnapshot,
  LocalCacheStoreEntry,
  LocalCacheStoreState,
} from "./store.types.js";
import { LocalCacheStateError, type LocalCachePolicy } from "./types.js";

export type {
  LocalCacheRead,
  LocalCacheStoreSnapshot,
  LocalCacheStoreEntry,
  LocalCacheStoreState,
} from "./store.types.js";

export const MISSING = Symbol("missing");

/** Pure byte-bounded LRU state owned by LocalCacheService; callers supply clock values. */
export class LocalCacheStore {
  private readonly entries = new Map<string, Entry>();
  private sequence = 0;
  private bytes = 0;
  private evictions = 0;
  private hits = 0;
  private misses = 0;

  /** Creates empty state using the validated entry and byte bounds. */
  constructor(private readonly policy: LocalCachePolicy) {}

  /** Reads an entry, expires stale values, and updates recency and hit/miss counters. */
  read(key: string, now: number): LocalCacheRead {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      this.misses += 1;
      return { value: MISSING, expired: false };
    }
    if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
      this.remove(key);
      this.misses += 1;
      return { value: MISSING, expired: true };
    }
    entry.lastUsed = ++this.sequence;
    this.hits += 1;
    return { value: entry.value, expired: false };
  }

  /** Replaces an entry and evicts least-recently-used values until both bounds hold. */
  write(key: string, value: unknown, bytes: number, expiresAt: number | undefined): void {
    this.remove(key);
    const entry: Entry = {
      key,
      value,
      bytes,
      ...(expiresAt === undefined ? {} : { expiresAt }),
      lastUsed: ++this.sequence,
    };
    this.entries.set(key, entry);
    this.bytes += bytes;
    this.evict();
  }

  /** Removes one entry and adjusts encoded byte accounting; reports whether it existed. */
  remove(key: string): boolean {
    const entry = this.entries.get(key);
    if (entry === undefined) return false;
    this.entries.delete(key);
    this.bytes -= entry.bytes;
    return true;
  }

  /** Removes every expired entry without changing hit/miss counters. */
  purgeExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) this.remove(key);
    }
  }

  /** Copies safe counters without exposing cached values or keys. */
  snapshot(): LocalCacheStoreSnapshot {
    return {
      entries: this.entries.size,
      bytes: this.bytes,
      evictions: this.evictions,
      hits: this.hits,
      misses: this.misses,
    };
  }

  /** Copies all entries and recency counters for the owning service's durable snapshot. */
  exportState(): LocalCacheStoreState {
    return {
      ...this.snapshot(),
      sequence: this.sequence,
      entries: [...this.entries.values()].map((entry) => ({
        key: entry.key,
        value: entry.value,
        bytes: entry.bytes,
        ...(entry.expiresAt === undefined ? {} : { expiresAt: entry.expiresAt }),
        lastUsed: entry.lastUsed,
      })),
    };
  }

  /** Validates snapshot entries, rebuilds accounting, and reapplies current policy limits. */
  restore(state: LocalCacheStoreState): void {
    this.entries.clear();
    this.bytes = 0;
    this.sequence = state.sequence;
    this.evictions = state.evictions;
    this.hits = state.hits;
    this.misses = state.misses;
    const seen = new Set<string>();
    for (const source of state.entries) {
      if (
        seen.has(source.key) ||
        !Number.isSafeInteger(source.bytes) ||
        source.bytes <= 0 ||
        !Number.isSafeInteger(source.lastUsed) ||
        source.lastUsed <= 0 ||
        (source.expiresAt !== undefined &&
          (!Number.isSafeInteger(source.expiresAt) || source.expiresAt <= 0))
      ) {
        throw new LocalCacheStateError("Cache snapshot entries are malformed");
      }
      seen.add(source.key);
      const entry: Entry = {
        key: source.key,
        value: source.value,
        bytes: source.bytes,
        ...(source.expiresAt === undefined ? {} : { expiresAt: source.expiresAt }),
        lastUsed: source.lastUsed,
      };
      this.entries.set(entry.key, entry);
      this.bytes += entry.bytes;
      this.sequence = Math.max(this.sequence, entry.lastUsed);
    }
    if (!Number.isSafeInteger(this.bytes) || this.bytes < 0) {
      throw new LocalCacheStateError("Cache snapshot byte count is invalid");
    }
    this.evict();
  }

  /** Releases all cached entries while preserving historical counters. */
  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }

  /** Evicts by recency using a bounded linear scan of the in-memory entries. */
  private evict(): void {
    while (this.entries.size > this.policy.maxEntries || this.bytes > this.policy.maxBytes) {
      let oldest: Entry | undefined;
      for (const entry of this.entries.values()) {
        if (oldest === undefined || entry.lastUsed < oldest.lastUsed) oldest = entry;
      }
      if (oldest === undefined) return;
      this.remove(oldest.key);
      this.evictions += 1;
    }
  }
}
