import type { API_VERSION, RuntimeActivationFingerprint } from "@relkit/contracts";
import type { SupervisorCandidateToken } from "./state-machine.types.js";
import type { LoggerOptions } from "@relkit/runtime-effect/logger";

import type { CandidateVerificationCodeSchema } from "./verification.schemas.js";

/** Verification codes derived from the authoritative literal schema. */
export type CandidateVerificationCode = typeof CandidateVerificationCodeSchema.Type;

/** Private backend identity and optional owned candidate cleanup. */
export interface CandidateVerificationCandidate {
  readonly port: number;
  readonly token: SupervisorCandidateToken;
  /** Releases this rejected candidate's native owner. @returns Complete candidate cleanup. */
  readonly dispose?: () => Promise<void>;
}

/** Expected compiled cohort, native probes and one shared readiness deadline. */
export interface CandidateVerificationOptions {
  readonly logger?: LoggerOptions;
  readonly candidate: CandidateVerificationCandidate;
  readonly activationFingerprint: RuntimeActivationFingerprint;
  readonly graphContractVersion?: number;
  readonly manifestContractVersion?: number;
  readonly manifestGeneratorVersion?: number;
  readonly hostname?: string;
  readonly healthTimeoutMs?: number;
  /** Starts liveness and readiness polling together for immutable prepared candidates. */
  readonly concurrentHealth?: boolean;
  readonly signal?: AbortSignal;
  readonly fetch?: typeof fetch;
}

/** Successfully admitted API/graph/manifest/readiness identity, retaining the original public shape. */
export interface CandidateVerificationResult {
  readonly token: SupervisorCandidateToken;
  readonly graphHash: string;
  readonly manifestGraphHash: string;
  readonly activationFingerprint: RuntimeActivationFingerprint;
  readonly graphContractVersion: number;
  readonly manifestContractVersion: number;
  readonly manifestGeneratorVersion: number;
  readonly apiVersion: typeof API_VERSION;
  readonly environmentReady: true;
  readonly providerReady: true;
}

/** Native response with selectively inspected internal-API metadata. */
export interface CandidateProbeResponse {
  readonly response: Response;
  readonly payload: Record<string, unknown>;
}
