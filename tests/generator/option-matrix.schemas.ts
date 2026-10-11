/**
 * Decodes generated metadata immediately at the test filesystem/JSON boundary.
 * Only fields consumed by matrix assertions enter typed test helpers; production
 * generation remains responsible for the complete package/output contract.
 */
import { Schema } from "effect";

/** Dependency specifications and scripts emitted by every starter manifest. */
export const GeneratedManifest = Schema.Struct({
  packageManager: Schema.String,
  dependencies: Schema.Record(Schema.String, Schema.String),
  devDependencies: Schema.Record(Schema.String, Schema.String),
  scripts: Schema.Record(Schema.String, Schema.String),
});

/** Shared compiler aliases used by every generated starter. */
export const GeneratedTsconfig = Schema.Struct({
  compilerOptions: Schema.Struct({
    baseUrl: Schema.optional(Schema.String),
    paths: Schema.optional(Schema.Record(Schema.String, Schema.Array(Schema.String))),
  }),
});

/** Serialized creation fields consumed by output and CLI formatting assertions. */
export const GeneratedOutput = Schema.Struct({
  ok: Schema.Literal(true),
  name: Schema.String,
  destination: Schema.String,
  installed: Schema.Boolean,
  gitInitialized: Schema.Boolean,
  nextSteps: Schema.Struct({
    commands: Schema.Struct({
      cd: Schema.String,
      install: Schema.optional(Schema.Literal("bun install")),
      dev: Schema.Literal("bun run dev"),
      test: Schema.Literal("bun run test"),
      check: Schema.Literal("bun run check"),
      build: Schema.Literal("bun run build"),
    }),
    endpoints: Schema.Struct({
      backend: Schema.String,
      inspector: Schema.String,
      openapi: Schema.String,
      apiReference: Schema.String,
      route: Schema.optional(Schema.String),
    }),
  }),
});
