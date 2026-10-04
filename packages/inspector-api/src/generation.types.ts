import type { MaybePromise, RuntimeActivationFingerprint } from "@relkit/contracts";
import type { InspectorGenerationServices } from "./shared.js";

/** Unactivated candidate identity and declaration metadata, resolved independently from active runtime services. */
export interface InspectorCandidateGeneration extends InspectorGenerationServices {
  readonly generationId?: string;
  readonly id?: string;
  readonly graphHash?: string;
  readonly activationFingerprint?: RuntimeActivationFingerprint;
  readonly sourceVersion?: number;
  readonly state?: string;
  readonly status?: string;
  readonly services?: InspectorGenerationServices;
}

/** Stored or lazily supplied candidate metadata; resolving it never activates candidate services. */
export type InspectorCandidateGenerationSource =
  InspectorCandidateGeneration | (() => MaybePromise<InspectorCandidateGeneration | undefined>);

/** Selected candidate graph and diagnostics evidence without active action authorities. */
export interface ResolvedCandidateGeneration {
  readonly generationId?: string;
  readonly graphHash?: string;
  readonly activationFingerprint?: RuntimeActivationFingerprint;
  readonly sourceVersion?: number;
  readonly state?: string;
  readonly status?: string;
  readonly graph?: unknown;
  readonly diagnostics?: unknown;
}
