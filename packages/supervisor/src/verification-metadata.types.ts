import type { CandidateVerificationResult } from "./verification.types.js";

/** Selectively admitted environment/provider readiness flags. */
export interface CandidateReadinessState {
  readonly environmentReady: boolean;
  readonly providerReady: boolean;
}

/** Graph/manifest identity fields validated without enumerating unrelated candidate payload values. */
export type CandidateGraphMetadata = Omit<
  CandidateVerificationResult,
  "token" | "apiVersion" | "environmentReady" | "providerReady" | "activationFingerprint"
>;
