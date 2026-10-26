/** Decodes only manifest repair fields that generated guides ask a reader to merge; dependency replacement blocks are rejected. */
import { Schema } from "effect";

export const GuideManifest = Schema.Record(Schema.String, Schema.Json);

export const GuideRepair = Schema.Struct({
  overrides: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  patchedDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  pnpm: Schema.optional(Schema.Struct({ overrides: Schema.Record(Schema.String, Schema.String) })),
});
