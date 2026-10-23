/** Decodes only native package manifest fields needed by export-map and packed dependency acceptance. */
import { Schema } from "effect";

export const PackageExportManifest = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  peerDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  exports: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  bin: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
