import type { GenerationId } from "@relkit/contracts";
import type { EvaluatorModuleResult, EvaluatorResponse } from "./discovery/evaluator-protocol.js";
import type { ExtractedDescriptor } from "./discovery/extract.js";

/** Data-only executable lookup reference for an evaluator generation. */
export interface RuntimeReference {
  readonly descriptorId: string;
  readonly kind: string;
  readonly module?: string;
  readonly exportName?: string;
  readonly generationId?: string;
}

/** Evaluated modules or extracted descriptors accepted as normalization source evidence. */
export type NormalizationSource =
  EvaluatorResponse | readonly EvaluatorModuleResult[] | readonly ExtractedDescriptor[];

/** Compiler generation identity used by executable reference selection. */
export type GenerationIdentity = GenerationId | string;
