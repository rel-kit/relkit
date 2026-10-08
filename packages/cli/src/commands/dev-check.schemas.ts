import { Schema } from "effect";
import { LoadedToolingConfigSchema } from "@relkit/compiler";

/** Data-only request admitted by the isolated compiler process. */
export const devCheckRequestSchema = Schema.Struct({
  projectRoot: Schema.String,
  generationId: Schema.String,
});
const location = Schema.Struct({
  file: Schema.String,
  line: Schema.Number,
  column: Schema.Number,
  message: Schema.optionalKey(Schema.String),
  descriptorId: Schema.optionalKey(Schema.String),
});
const diagnostic = Schema.Struct({
  code: Schema.String,
  severity: Schema.Literals(["info", "warning", "error"]),
  message: Schema.String,
  file: Schema.optionalKey(Schema.String),
  line: Schema.optionalKey(Schema.Number),
  column: Schema.optionalKey(Schema.Number),
  descriptorId: Schema.optionalKey(Schema.String),
  related: Schema.optionalKey(Schema.Array(location)),
  suggestion: Schema.optionalKey(Schema.String),
  documentationPath: Schema.optionalKey(Schema.String),
});
const outputs = Schema.Struct({
  graph: Schema.String,
  manifest: Schema.String,
  runtimeActivation: Schema.String,
  runtimeIntegrations: Schema.String,
  runtimeIntegrationImports: Schema.String,
  localServices: Schema.String,
  diagnostics: Schema.String,
  jobsManifest: Schema.optionalKey(Schema.String),
  openapi: Schema.String,
  client: Schema.String,
  contract: Schema.String,
  clientContract: Schema.String,
  clientRegistry: Schema.String,
  clientManifest: Schema.String,
});
/** Complete response record accepted at the private IPC boundary. */
export const devCheckResponseSchema = Schema.Union([
  Schema.Struct({ error: Schema.String }),
  Schema.Struct({
    result: Schema.Struct({
      ok: Schema.Boolean,
      activatable: Schema.Boolean,
      projectRoot: Schema.String,
      generatedDirectory: Schema.String,
      graphHash: Schema.optionalKey(Schema.String),
      diagnostics: Schema.Array(diagnostic),
      outputs,
      config: Schema.optionalKey(LoadedToolingConfigSchema),
    }),
  }),
]);
