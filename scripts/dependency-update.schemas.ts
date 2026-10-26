/** Decodes dependency manifests and the data-only bundle passed from read-only CI to trusted PR automation. */
import { Schema } from "effect";

/** Dependency maps relevant to catalog ownership; unrelated manifest fields remain in the original JSON object. */
export const DependencyManifest = Schema.Struct({
  name: Schema.optional(Schema.String),
  private: Schema.optional(Schema.Boolean),
  catalog: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  devDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  optionalDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  peerDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});

/** UTF-8 file contents are data; the privileged job never extracts or executes these paths. */
export const DependencyBundle = Schema.Struct({
  repository: Schema.String,
  head: Schema.String,
  files: Schema.Array(Schema.Struct({ path: Schema.String, content: Schema.String })),
});
