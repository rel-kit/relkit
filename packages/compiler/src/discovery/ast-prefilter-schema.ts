import { Schema } from "effect";
import { ExportFacts } from "./source-facts-schema.js";

/** Evidence that a module might contribute a runtime descriptor. */
export const AstCandidateIndicator = Schema.Literals([
  "relkit-import",
  "factory",
  "default-export",
  "brand-access",
  "re-export",
]);

/** Authored source text supplied to syntax discovery. */
export const AstSourceModule = Schema.Struct({ fileName: Schema.String, text: Schema.String });

/** Runtime re-export evidence retained by syntax discovery. */
export const AstReExport = Schema.Struct({
  moduleSpecifier: Schema.String,
  names: Schema.Array(Schema.String),
  exportAll: Schema.Boolean,
});

/** A possible runtime descriptor module and its deterministic syntax evidence. */
export const AstPrefilterCandidate = Schema.Struct({
  fileName: Schema.String,
  imports: Schema.Array(Schema.String),
  factories: Schema.Array(Schema.String),
  defaultExports: Schema.Array(Schema.String),
  brandAccess: Schema.Boolean,
  reExports: Schema.Array(AstReExport),
  facts: ExportFacts,
  indicators: Schema.Array(AstCandidateIndicator),
});

/** A module omitted by configuration or by the absence of candidate evidence. */
export const AstPrefilterSkipped = Schema.Struct({
  fileName: Schema.String,
  reason: Schema.Literals(["excluded", "no-candidate-indicator"]),
});

/** Caller-supplied discovery root and optional exclusion override. */
export const AstPrefilterOptions = Schema.Struct({
  projectRoot: Schema.optionalKey(Schema.String),
  exclude: Schema.optionalKey(Schema.Array(Schema.String)),
});

/** Deterministic candidate and skipped-module lists. */
export const AstPrefilterResult = Schema.Struct({
  candidates: Schema.Array(AstPrefilterCandidate),
  skipped: Schema.Array(AstPrefilterSkipped),
});
