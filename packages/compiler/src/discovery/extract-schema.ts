import { Schema } from "effect";
import {
  EvaluatorDescriptorSnapshot,
  EvaluatorManifestReference,
} from "./evaluator-protocol-schema.js";
import {
  SourceMapOptions,
  SourceMapEntry,
  LocatedSource,
  ExportKind,
} from "./source-map-schema.js";

/** Extraction settings, extending source mapping with existing map/generation authority. */
export const ExtractOptions = Schema.Struct({
  ...SourceMapOptions.fields,
  generationId: Schema.optionalKey(Schema.String),
  sourceMap: Schema.optionalKey(Schema.Array(SourceMapEntry)),
});

/** Data-only descriptor plus source and executable reference provenance. */
export const ExtractedDescriptor = Schema.Struct({
  ...LocatedSource.fields,
  descriptor: EvaluatorDescriptorSnapshot,
  exportName: Schema.String,
  exportKind: ExportKind,
  reference: EvaluatorManifestReference,
});
