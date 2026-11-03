import { Schema } from "effect";
import { StateCount } from "../state.schemas.js";

/** Restorable byte-LRU entry, including absolute expiry and last access order. */
export const CacheEntry = Schema.Struct({
  key: Schema.String,
  value: Schema.Json,
  bytes: StateCount,
  lastUsed: StateCount,
  expiresAt: Schema.optionalKey(StateCount),
});

/** Version-one cache snapshot; canonical keys and byte totals are validated separately. */
export const CacheSnapshot = Schema.Struct({
  version: Schema.Literal(1),
  cacheId: Schema.String,
  schemaVersion: Schema.Union([Schema.String, Schema.Number]),
  sequence: StateCount,
  bytes: StateCount,
  evictions: StateCount,
  hits: StateCount,
  misses: StateCount,
  entries: Schema.Array(CacheEntry),
});
