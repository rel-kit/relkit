import { Schema } from "effect";

/** Restored keys retain the canonical identity produced by the native fake. */
export const CacheStorageKey = Schema.Struct({
  cacheId: Schema.String,
  schemaVersion: Schema.Union([Schema.String, Schema.Number]),
  key: Schema.Unknown,
});

/** Detached storage transfer; restoring requires matching cache identity/version. */
export const CacheStorageSnapshot = Schema.Struct({
  cacheId: Schema.String,
  schemaVersion: Schema.Union([Schema.String, Schema.Number]),
  records: Schema.Array(
    Schema.Struct({
      key: Schema.String,
      value: Schema.Unknown,
      expiresAt: Schema.optionalKey(Schema.Finite),
    }),
  ),
});
