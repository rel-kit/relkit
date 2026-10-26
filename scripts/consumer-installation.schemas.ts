/**
 * Decodes only the manifest fields needed for physical dependency traversal.
 * Package metadata is data: collection never imports executable package code.
 */
import { Schema } from "effect";

const dependencies = Schema.optionalKey(Schema.Record(Schema.String, Schema.String));

/** Manifest dependency declarations retained independently of workspace catalogs. */
export const ConsumerManifest = Schema.Struct({
  name: Schema.String,
  version: Schema.optionalKey(Schema.String),
  dependencies,
  devDependencies: dependencies,
  optionalDependencies: dependencies,
  peerDependencies: dependencies,
  peerDependenciesMeta: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Struct({ optional: Schema.optionalKey(Schema.Boolean) })),
  ),
});
