/**
 * Decodes structured source/export provenance before convention checks inspect it.
 * Runtime descriptors stay outside this metadata codec and are narrowed by the
 * existing descriptor guards, preserving opaque callable implementation values.
 */
import { Schema } from "effect";

/** Source export evidence consumed by nonfatal default-export suggestions. */
export const ConventionExport = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  isDefault: Schema.optionalKey(Schema.Boolean),
  defaultExport: Schema.optionalKey(Schema.Boolean),
});

/** Validated source coordinates and export metadata; descriptor values are separate. */
export const ConventionProvenance = Schema.Struct({
  sourcePath: Schema.String,
  projectRoot: Schema.optionalKey(Schema.String),
  location: Schema.optionalKey(Schema.Struct({ line: Schema.Number, column: Schema.Number })),
  exportName: Schema.optionalKey(Schema.String),
  exportKind: Schema.optionalKey(Schema.Literals(["default", "named", "none"])),
  isDefaultExport: Schema.optionalKey(Schema.Boolean),
  defaultExport: Schema.optionalKey(Schema.Boolean),
  exports: Schema.optionalKey(Schema.Array(ConventionExport)),
});
