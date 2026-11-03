import type { Schema } from "effect";
import type * as Models from "./source-id-schema.js";

/** Source identity inputs derived from the runtime contract. */
export interface SourceIdInput extends Schema.Schema.Type<typeof Models.SourceIdInput> {}

/** Export identity inputs; exportFact remains syntax provenance, never runtime evaluation. */
export interface ExportIdInput extends Schema.Schema.Type<typeof Models.ExportIdInput> {}

/** Conventional source path rule for one descriptor kind. */
export interface KindRule extends Schema.Schema.Type<typeof Models.KindRule> {}
