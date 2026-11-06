import { Schema } from "effect";
import { ExportFact, ExportFacts } from "./source-facts-schema.js";

/** Portable source-location contract reused from the authoritative contracts API. */
export const SourcePosition = Schema.Struct({
  file: Schema.String,
  line: Schema.Number,
  column: Schema.Number,
});

/** Export identity classification shared by mapping and extraction. */
export const ExportKind = Schema.Literals(["default", "named"]);

/** Supplemental UTF-8 source text, indexed by project-relative path. */
export const SourceMapSource = Schema.Struct({ fileName: Schema.String, text: Schema.String });

/** Caller-supplied mapping settings; omission uses the compatibility root. */
export const SourceMapOptions = Schema.Struct({
  projectRoot: Schema.optionalKey(Schema.String),
  sources: Schema.optionalKey(Schema.Array(SourceMapSource)),
});

/** Provenance located by AST traversal; facts are omitted for missing sources. */
export const LocatedSource = Schema.Struct({
  source: SourcePosition,
  facts: Schema.optionalKey(ExportFacts),
  exportFact: Schema.optionalKey(ExportFact),
});

/** Stable mapping result for a single evaluated export. */
export const SourceMapEntry = Schema.Struct({
  ...LocatedSource.fields,
  module: Schema.String,
  exportName: Schema.String,
  exportKind: ExportKind,
});
