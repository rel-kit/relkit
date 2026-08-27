import type { GenerationId } from "@relkit/contracts";
import type { EvaluatorModuleResult, EvaluatorResponse } from "./discovery/evaluator-protocol.js";
import type { ExtractedDescriptor } from "./discovery/extract.js";

export interface RuntimeReference {
  readonly descriptorId: string;
  readonly kind: string;
  readonly module?: string;
  readonly exportName?: string;
  readonly generationId?: string;
}

export type NormalizationSource =
  EvaluatorResponse | readonly EvaluatorModuleResult[] | readonly ExtractedDescriptor[];

export type GenerationIdentity = GenerationId | string;
