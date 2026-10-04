import { Schema } from "effect";

/** Schema authority for detached native fake bucket transfers. */
export const BucketStorageSnapshot = Schema.Struct({
  bucketId: Schema.String,
  records: Schema.Array(
    Schema.Struct({
      key: Schema.String,
      bytes: Schema.Uint8Array,
      metadata: Schema.Struct({
        etag: Schema.String,
        contentHash: Schema.optionalKey(Schema.String),
        size: Schema.optionalKey(Schema.Finite),
        contentType: Schema.optionalKey(Schema.String),
        metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
      }),
    }),
  ),
});
