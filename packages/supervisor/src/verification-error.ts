import type { CandidateVerificationCode } from "./verification.types.js";

/** Existing native/public verification error; internal workflows retain its identity. */
export class CandidateVerificationError extends Error {
  readonly code: CandidateVerificationCode;
  /** @param code - Existing bounded readiness failure. @param message - Public diagnostic detail. */
  constructor(code: CandidateVerificationCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "CandidateVerificationError";
    this.code = code;
  }
}
