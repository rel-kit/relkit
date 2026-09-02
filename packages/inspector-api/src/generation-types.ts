import type { MaybePromise, RuntimeActivationFingerprint } from "@relkit/contracts";
import type { InspectorGenerationServices } from "./shared.js";

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

export type InspectorCandidateGenerationSource =
  InspectorCandidateGeneration | (() => MaybePromise<InspectorCandidateGeneration | undefined>);

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
