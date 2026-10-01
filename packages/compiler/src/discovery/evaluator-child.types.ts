import type { Schema } from "effect";
import type { CandidateResultSchema } from "./evaluator-protocol-schema.js";

/** One candidate's framed outcome and captured output, before transport aggregation. */
export interface CandidateResult extends Schema.Schema.Type<typeof CandidateResultSchema> {}
