import { Schema } from "effect";
import { ExportFact, SourceFactoryKind } from "./source-facts-schema.js";
import { ExportKind } from "./source-map-schema.js";

/** Source identity inputs; explicit values remain unknown until contracts validation. */
export const SourceIdInput = Schema.Struct({
  kind: SourceFactoryKind,
  source: Schema.String,
  projectRoot: Schema.optionalKey(Schema.String),
  explicitId: Schema.optionalKey(Schema.Unknown),
  exportName: Schema.optionalKey(Schema.String),
  exportKind: Schema.optionalKey(ExportKind),
  binding: Schema.optionalKey(Schema.String),
  serviceId: Schema.optionalKey(Schema.String),
  member: Schema.optionalKey(Schema.String),
  method: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.String),
});

/** Export identity contract shared by descriptor source normalization. */
export const ExportIdInput = Schema.Struct({
  source: Schema.String,
  kind: SourceFactoryKind,
  exportName: Schema.String,
  exportKind: ExportKind,
  projectRoot: Schema.optionalKey(Schema.String),
  binding: Schema.optionalKey(Schema.String),
  explicitId: Schema.optionalKey(Schema.Unknown),
  exportFact: Schema.optionalKey(ExportFact),
});

/** Conventional source category and suffix stripping rules. */
export const KindRule = Schema.Struct({
  category: Schema.optionalKey(Schema.String),
  suffixes: Schema.Array(Schema.String),
});
