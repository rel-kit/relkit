import { Schema } from "effect";
import { StateCount } from "../state.schemas.js";

/** Version-one object envelope; integrity is checked against the decoded bytes separately. */
export const StoredBucketObject = Schema.Struct({
  version: Schema.Literal(1),
  key: Schema.String,
  size: StateCount,
  contentHash: Schema.String,
  etag: Schema.String,
  contentType: Schema.optionalKey(Schema.String),
  metadata: Schema.Record(Schema.String, Schema.String),
  data: Schema.String,
});
