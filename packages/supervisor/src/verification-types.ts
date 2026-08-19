import { API_VERSION } from "@zsys/contracts";
import type { SupervisorCandidateToken } from "./state-machine-types.js";

export const DEFAULT_CANDIDATE_HEALTH_TIMEOUT_MS = 2_000;

export type CandidateVerificationCode =
  | "ZSYS_CANDIDATE_API_VERSION_UNSUPPORTED"
  | "ZSYS_CANDIDATE_GENERATION_MISMATCH"
  | "ZSYS_CANDIDATE_GRAPH_VERSION_UNSUPPORTED"
  | "ZSYS_CANDIDATE_MANIFEST_VERSION_UNSUPPORTED"
  | "ZSYS_CANDIDATE_GENERATOR_VERSION_UNSUPPORTED"
  | "ZSYS_CANDIDATE_GRAPH_HASH_MISMATCH"
  | "ZSYS_CANDIDATE_ENVIRONMENT_NOT_READY"
  | "ZSYS_CANDIDATE_PROVIDER_NOT_READY"
  | "ZSYS_CANDIDATE_RESPONSE_INVALID"
  | "ZSYS_CANDIDATE_HEALTH_TIMEOUT";

export class CandidateVerificationError extends Error {
  readonly code: CandidateVerificationCode;

  constructor(code: CandidateVerificationCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "CandidateVerificationError";
    this.code = code;
  }
}

export interface CandidateVerificationCandidate {
  readonly port: number;
  readonly token: SupervisorCandidateToken;
  readonly dispose?: () => Promise<void>;
}

export interface CandidateVerificationOptions {
  readonly candidate: CandidateVerificationCandidate;
  readonly graphHash: string;
  readonly graphContractVersion?: number;
  readonly manifestContractVersion?: number;
  readonly manifestGeneratorVersion?: number;
  readonly hostname?: string;
  readonly healthTimeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly fetch?: typeof fetch;
}

export interface CandidateVerificationResult {
  readonly token: SupervisorCandidateToken;
  readonly graphHash: string;
  readonly manifestGraphHash: string;
  readonly graphContractVersion: number;
  readonly manifestContractVersion: number;
  readonly manifestGeneratorVersion: number;
  readonly apiVersion: typeof API_VERSION;
  readonly environmentReady: true;
  readonly providerReady: true;
}

export interface CandidateProbeResponse {
  readonly response: Response;
  readonly payload: Record<string, unknown>;
}
