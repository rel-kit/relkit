import { Schema } from "effect";

/** Owned workspace fields, retaining unrelated project metadata verbatim. */
export const ContributorManifest = Schema.StructWithRest(
  Schema.Struct({
    name: Schema.optionalKey(Schema.String),
    version: Schema.optionalKey(Schema.String),
    dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    devDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** Normalized generator options admitted by the contributor command callback. */
export const ContributorCreateOptions = Schema.Struct({
  name: Schema.String,
  template: Schema.Literals(["minimal", "api", "agent", "fullstack"]),
  cloud: Schema.Literals(["aws", "none"]),
  deploy: Schema.Literals(["pulumi", "none"]),
  jobs: Schema.optionalKey(
    Schema.Literals(["inngest-docker", "effect-mq-docker", "trigger-docker"]),
  ),
  install: Schema.Boolean,
  git: Schema.Boolean,
  examples: Schema.Boolean,
  directory: Schema.optionalKey(Schema.String),
  forceEmptyDirectory: Schema.Boolean,
  json: Schema.Boolean,
});
