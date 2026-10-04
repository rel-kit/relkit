import type { CacheClient, CacheOperationOptions, CacheProvider } from "@relkit/cache";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { TestFailureControls } from "./fakes.js";

/**
 * Native key/value schemas, TTL policy and explicit fake-owner dependencies.
 * @typeParam KeySchema - Native schema validating public cache keys.
 * @typeParam ValueSchema - Native schema validating and inferring stored values.
 */
export interface TestCacheFakeOptions<
  KeySchema extends StandardSchemaV1 = StandardSchemaV1,
  ValueSchema extends StandardSchemaV1 = StandardSchemaV1,
> {
  readonly cacheId?: string;
  readonly ownerId?: string;
  readonly stateRoot?: string;
  readonly clock?: () => number;
  readonly failures?: TestFailureControls;
  readonly logger?: import("@relkit/runtime-effect").LoggerOptions;
  readonly keySchema?: KeySchema;
  readonly valueSchema?: ValueSchema;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
  readonly schemaVersion?: string | number;
}

/** Native cache occupancy and identity evidence without memoization eviction. */
export interface TestCacheSnapshot {
  readonly cacheId: string;
  readonly schemaVersion: string | number;
  readonly entries: number;
  readonly inFlight: number;
}

/**
 * Authoritative writable native cache facade with detached transfer and release controls.
 * @typeParam Key - Public native cache key type.
 * @typeParam Value - Public native cache value type.
 */
export type TestCacheFake<Key, Value> = CacheClient<Key, Value> & {
  readonly provider: CacheProvider;
  readonly client: CacheClient<Key, Value>;
  readonly capabilities: { readonly increment: true };
  readonly stateRoot: string;
  readonly seed: (key: Key, value: Value, options?: CacheOperationOptions) => Promise<void>;
  readonly read: (key: Key) => Promise<Value | undefined>;
  readonly increment: (
    key: Key,
    delta?: number,
    options?: CacheOperationOptions,
  ) => Promise<number>;
  readonly inspect: () => TestCacheSnapshot;
  readonly snapshot: () => import("./cache-storage.types.js").CacheStorageSnapshot;
  readonly restore: (snapshot: unknown) => void;
  readonly clear: () => void;
  readonly close: () => Promise<void>;
};
