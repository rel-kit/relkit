import type { NormalizedDescriptor } from "./normalize-types.js";

/** Source identity inference state owned by one normalization execution. */
export interface IdentityCandidate {
  readonly descriptor: NormalizedDescriptor;
  readonly originalId: string;
  readonly inferred: boolean;
  resolved?: string;
}
