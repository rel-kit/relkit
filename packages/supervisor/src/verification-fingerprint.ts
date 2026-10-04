import {
  canonicalJson,
  isRuntimeActivationFingerprint,
  type RuntimeActivationFingerprint,
} from "@relkit/contracts";
import { CandidateVerificationError } from "./verification-error.js";

/** Checks the complete runtime activation cohort. @param payload - Selective internal metadata.
 * @param expected - Compiled graph/manifest/integration hashes. @returns Native admitted fingerprint. */
export function verifyActivationFingerprint(
  payload: Record<string, unknown>,
  expected: RuntimeActivationFingerprint,
): RuntimeActivationFingerprint {
  const actual = payload.activationFingerprint;
  if (!isRuntimeActivationFingerprint(actual) || canonicalJson(actual) !== canonicalJson(expected))
    throw new CandidateVerificationError(
      "RELKIT_CANDIDATE_ACTIVATION_MISMATCH",
      "Candidate activation fingerprint does not match the compiled cohort.",
    );
  return actual;
}
