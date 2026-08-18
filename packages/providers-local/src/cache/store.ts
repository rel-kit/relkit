import { LocalCacheStateError, type LocalCachePolicy } from "./types.js";

export const MISSING = Symbol("missing");

interface Entry {
  readonly key: string;
  readonly value: unknown;
  readonly bytes: number;
  readonly expiresAt?: number;
  lastUsed: number;
}

export interface LocalCacheRead {
  readonly value: unknown | typeof MISSING;
  readonly expired: boolean;
}

export interface LocalCacheStoreSnapshot {
  readonly entries: number;
  readonly bytes: number;
  readonly evictions: number;
  readonly hits: number;
  readonly misses: number;
}

export interface LocalCacheStoreEntry {
  readonly key: string;
  readonly value: unknown;
  readonly bytes: number;
  readonly expiresAt?: number;
  readonly lastUsed: number;
}

export interface LocalCacheStoreState extends Omit<LocalCacheStoreSnapshot, "entries"> {
  readonly sequence: number;
  readonly entries: readonly LocalCacheStoreEntry[];
}

export class LocalCacheStore {
  private readonly entries = new Map<string, Entry>();
  private sequence = 0;
  private bytes = 0;
  private evictions = 0;
  private hits = 0;
  private misses = 0;

  constructor(private readonly policy: LocalCachePolicy) {}

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

  remove(key: string): boolean {
    const entry = this.entries.get(key);
    if (entry === undefined) return false;
    this.entries.delete(key);
    this.bytes -= entry.bytes;
    return true;
  }

  purgeExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) this.remove(key);
    }
  }

  snapshot(): LocalCacheStoreSnapshot {
    return {
      entries: this.entries.size,
      bytes: this.bytes,
      evictions: this.evictions,
      hits: this.hits,
      misses: this.misses,
    };
  }

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

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }

  // ponytail: linear LRU scan; use an ordered index only if large bounds make it measurable.
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
