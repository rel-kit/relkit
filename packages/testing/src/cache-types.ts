import type { CacheClient, CacheOperationOptions, CacheProvider } from "@relkit/cache";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { TestFailureControls } from "./fakes.js";

export interface TestCacheFakeOptions<
  KeySchema extends StandardSchemaV1 = StandardSchemaV1,
  ValueSchema extends StandardSchemaV1 = StandardSchemaV1,
> {
  readonly cacheId?: string;
  readonly ownerId?: string;
  readonly stateRoot?: string;
  readonly clock?: () => number;
  readonly failures?: TestFailureControls;
  readonly keySchema?: KeySchema;
  readonly valueSchema?: ValueSchema;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
  readonly schemaVersion?: string | number;
}

export interface TestCacheSnapshot {
  readonly cacheId: string;
  readonly schemaVersion: string | number;
  readonly entries: number;
  readonly inFlight: number;
}

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
  readonly clear: () => void;
  readonly close: () => Promise<void>;
};
