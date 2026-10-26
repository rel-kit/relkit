/** Decodes the build's selected normal production dependency declarations. */
import { Schema } from "effect";

/** Package versions are read as data; native package metadata supplies their identities. */
export const ProductionManifest = Schema.Struct({
  dependencies: Schema.Record(Schema.String, Schema.String),
});
