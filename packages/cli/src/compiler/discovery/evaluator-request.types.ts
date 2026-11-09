import type { Schema } from "effect";
import type { EvaluatorOptionsSchema } from "./evaluator-request.js";

/** Caller input normalized into the versioned child request. */
export interface EvaluatorOptions extends Schema.Schema.Type<typeof EvaluatorOptionsSchema> {}
