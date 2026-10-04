import type { Effect } from "effect";
import type { CandidateVerificationResult } from "./verification.types.js";

/** Native probe implementation substituted independently in deterministic tests. */
export interface VerificationPlatformService {
  readonly fetch: typeof fetch;
}

/** One candidate's readiness and identity workflow. */
export interface VerificationService {
  /** Verifies under one shared deadline. @returns The accepted generation identity. */
  readonly verify: Effect.Effect<CandidateVerificationResult, unknown>;
}
