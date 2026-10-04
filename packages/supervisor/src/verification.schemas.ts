import { Schema } from "effect";

/** Existing verification error vocabulary, retained at the public boundary. */
export const CandidateVerificationCodeSchema = Schema.Literals([
  "RELKIT_CANDIDATE_API_VERSION_UNSUPPORTED",
  "RELKIT_CANDIDATE_GENERATION_MISMATCH",
  "RELKIT_CANDIDATE_GRAPH_VERSION_UNSUPPORTED",
  "RELKIT_CANDIDATE_MANIFEST_VERSION_UNSUPPORTED",
  "RELKIT_CANDIDATE_GENERATOR_VERSION_UNSUPPORTED",
  "RELKIT_CANDIDATE_GRAPH_HASH_MISMATCH",
  "RELKIT_CANDIDATE_ACTIVATION_MISMATCH",
  "RELKIT_CANDIDATE_ENVIRONMENT_NOT_READY",
  "RELKIT_CANDIDATE_PROVIDER_NOT_READY",
  "RELKIT_CANDIDATE_RESPONSE_INVALID",
  "RELKIT_CANDIDATE_HEALTH_TIMEOUT",
]);

/** Internal rejection; the compatibility edge restores its original public object. */
export class VerificationFailure extends Schema.TaggedError<VerificationFailure>()(
  "VerificationFailure",
  { error: Schema.Unknown },
) {}
