import { Schema } from "effect";
import { isRuntimeActivationFingerprint } from "@relkit/contracts";

/** Owner-validated activation identity at the manifest JSON boundary. */
export const builtActivationSchema = Schema.declare(isRuntimeActivationFingerprint);

/** Required build cohort metadata before version and canonical identity comparisons. */
export const builtManifestSchema = Schema.Struct({
  contractVersion: Schema.Number,
  generatorVersion: Schema.Number,
  graphVersion: Schema.Number,
  manifestVersion: Schema.Number,
  graphHash: Schema.String,
  activationFingerprint: builtActivationSchema,
  entrypoint: Schema.String,
  containerEntrypoint: Schema.String,
  runtimeManifestFile: Schema.String,
  jobsManifestFile: Schema.optionalKey(Schema.String),
  runtimeActivationFile: Schema.String,
  runtimeIntegrationsPlanFile: Schema.String,
  localServicesPlanFile: Schema.optionalKey(Schema.String),
  server: Schema.optionalKey(Schema.Struct({ port: Schema.optionalKey(Schema.Number) })),
});

/** Untrusted artifact object; domain owners validate semantic and version contracts. */
export const builtJsonObject = Schema.Record(Schema.String, Schema.Unknown);
