import { Schema } from "effect";

/** Public contract envelope retaining extra portable JSON fields during pull/check. */
export const clientDocumentSchema = Schema.StructWithRest(
  Schema.Struct({
    protocol: Schema.String,
    version: Schema.Number,
    graphHash: Schema.String,
    publicFingerprint: Schema.String,
    procedures: Schema.Array(Schema.Json),
    routes: Schema.optionalKey(Schema.Array(Schema.Json)),
    channels: Schema.optionalKey(Schema.Array(Schema.Json)),
    agents: Schema.optionalKey(Schema.Array(Schema.Json)),
    jobs: Schema.optionalKey(Schema.Array(Schema.Json)),
    capabilities: Schema.optionalKey(Schema.Json),
    nameToId: Schema.optionalKey(Schema.Json),
  }),
  [Schema.Record(Schema.String, Schema.Json)],
);

/** Procedure header validated before its nested error metadata. */
export const clientProcedureSchema = Schema.Struct({
  name: Schema.String,
  errors: Schema.Array(Schema.Unknown),
  input: Schema.optionalKey(Schema.Unknown),
  output: Schema.optionalKey(Schema.Unknown),
});

/** Declared error metadata consumed by the existing client generator. */
export const clientErrorSchema = Schema.Struct({
  id: Schema.String,
  schema: Schema.optionalKey(Schema.Unknown),
});

/** Protocol selection before version-specific contract decoding. */
export const clientEnvelopeSchema = Schema.Record(Schema.String, Schema.Unknown);
