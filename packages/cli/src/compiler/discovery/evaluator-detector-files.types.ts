import type { EvaluatorDetectorOptions } from "./evaluator-detectors.types.js";

/** File guard settings derived from the authoritative detector options schema. */
export type FileDetectorOptions = Pick<
  EvaluatorDetectorOptions,
  "projectRoot" | "generatedDirectory"
>;
