import { Schema } from "effect";

/** JSON object boundary, retaining unrelated package and workspace fields. */
export const JsonObject = Schema.Record(Schema.String, Schema.Unknown);

/** Owned manifest fields; unrelated metadata keeps its authored order and shape. */
export const ScaffoldManifestSchema = Schema.StructWithRest(
  Schema.Struct({
    dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    devDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    scripts: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
  [JsonObject],
);

/** Validated string-valued package fields owned by scaffold planning. */
export const ProjectManifest = Schema.StructWithRest(
  Schema.Struct({
    dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    devDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    scripts: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    patchedDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
  [JsonObject],
);

/** Required starter fields used by deployment customization. */
export const TemplateManifest = Schema.StructWithRest(
  Schema.Struct({
    dependencies: Schema.Record(Schema.String, Schema.String),
    scripts: Schema.Record(Schema.String, Schema.String),
  }),
  [JsonObject],
);
