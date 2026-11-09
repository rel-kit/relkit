import type { Schema } from "effect";
import type * as Models from "./ast-prefilter-schema.js";

/** An ordered category of runtime descriptor evidence. */
export type AstCandidateIndicator = Schema.Schema.Type<typeof Models.AstCandidateIndicator>;

/** One source filename and its unevaluated text. */
export interface AstSourceModule extends Schema.Schema.Type<typeof Models.AstSourceModule> {}

/** Runtime named or wildcard re-export evidence. */
export interface AstReExport extends Schema.Schema.Type<typeof Models.AstReExport> {}

/** A module whose syntax could contribute runtime descriptors. */
export interface AstPrefilterCandidate extends Schema.Schema.Type<
  typeof Models.AstPrefilterCandidate
> {}

/** A module skipped with an explicit reason. */
export interface AstPrefilterSkipped extends Schema.Schema.Type<
  typeof Models.AstPrefilterSkipped
> {}

/** Source root and glob exclusions used by candidate discovery. */
export interface AstPrefilterOptions extends Schema.Schema.Type<
  typeof Models.AstPrefilterOptions
> {}

/** Candidate and skipped modules sorted by normalized filename. */
export interface AstPrefilterResult extends Schema.Schema.Type<typeof Models.AstPrefilterResult> {}
