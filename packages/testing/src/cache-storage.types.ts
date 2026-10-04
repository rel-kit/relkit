import type { CacheProvider } from "@relkit/cache";
import type { Effect } from "effect";

import type { TestFailureControls } from "./fakes.js";
import type { TestCacheSnapshot } from "./cache-types.js";
import type { CacheStorageSnapshot as SnapshotSchema } from "./cache-storage.schemas.js";

/** Detached native cache transfer derived from its decoding schema authority. */
export type CacheStorageSnapshot = typeof SnapshotSchema.Type;

/** Detached authoritative cache value with an optional deterministic expiration timestamp. */
export interface CacheEntry {
  readonly value: unknown;
  readonly expiresAt?: number;
}

/** Authoritative state survives until explicit owner release, without eviction. */
export interface CacheStorageState {
  closed: boolean;
  readonly entries: Map<string, CacheEntry>;
  readonly flights: Map<string, Promise<unknown>>;
}

/** Validated native write policy captured once before storage acquisition. */
export interface CacheStoragePolicy {
  readonly cacheId: string;
  readonly schemaVersion: string | number;
  readonly clock: () => number;
  readonly failures: TestFailureControls;
  readonly defaultTtlMs: number | undefined;
  readonly maxTtlMs: number | undefined;
}

/** Effect decisions over authoritative writable cache state and transfer boundaries. */
export interface CacheStorageService {
  readonly stateRoot: string;
  readonly get: (
    ...args: Parameters<NonNullable<CacheProvider["get"]>>
  ) => Effect.Effect<unknown, unknown>;
  readonly set: (
    ...args: Parameters<NonNullable<CacheProvider["set"]>>
  ) => Effect.Effect<void, unknown>;
  readonly delete: (
    ...args: Parameters<NonNullable<CacheProvider["delete"]>>
  ) => Effect.Effect<void, unknown>;
  readonly has: (
    ...args: Parameters<NonNullable<CacheProvider["has"]>>
  ) => Effect.Effect<boolean, unknown>;
  readonly getOrSet: (
    ...args: Parameters<NonNullable<CacheProvider["getOrSet"]>>
  ) => Effect.Effect<unknown, unknown>;
  readonly increment: (
    ...args: Parameters<NonNullable<CacheProvider["increment"]>>
  ) => Effect.Effect<number, unknown>;
  readonly inspect: Effect.Effect<TestCacheSnapshot>;
  readonly snapshot: Effect.Effect<CacheStorageSnapshot>;
  readonly restore: (snapshot: unknown) => Effect.Effect<void, unknown>;
  readonly clear: Effect.Effect<void>;
  readonly close: Effect.Effect<void>;
}
