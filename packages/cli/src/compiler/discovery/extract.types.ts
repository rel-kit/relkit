import type { Schema } from "effect";
import type * as Models from "./extract-schema.js";
import type { EvaluatorResponse, EvaluatorModuleResult } from "./evaluator-protocol.js";

/** Caller extraction settings derived from the runtime contract. */
export interface ExtractOptions extends Schema.Schema.Type<typeof Models.ExtractOptions> {}

/** Immutable data-only descriptor with source and execution provenance. */
export interface ExtractedDescriptor extends Schema.Schema.Type<
  typeof Models.ExtractedDescriptor
> {}

/** Authoritative evaluator response or preselected module result input. */
export type ExtractionInput = EvaluatorResponse | readonly EvaluatorModuleResult[];
