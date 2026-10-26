/** Validates the package fields required to audit declaration exports; unrelated manifest fields stay with their owners. */
import { Schema } from "effect";

export const PublicApiManifest = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  exports: Schema.Record(Schema.String, Schema.Struct({ types: Schema.String })),
});
