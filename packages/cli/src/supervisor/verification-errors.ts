import { Effect } from "effect";
import { VerificationFailure } from "./verification.schemas.js";
import { CandidateVerificationError } from "./verification-error.js";

/**
 * Keeps expected verification rejection typed and unexpected throws as defects.
 * @typeParam A - Pure result. @param evaluate - Selective verification calculation.
 * @returns The validated result or a failure retaining public error identity.
 */
export function validateVerification<A>(evaluate: () => A): Effect.Effect<A, VerificationFailure> {
  return Effect.try({
    try: evaluate,
    catch: (error) => {
      if (error instanceof CandidateVerificationError) return new VerificationFailure({ error });
      throw error;
    },
  });
}

/** Raises an existing rejection in the typed channel.
 * @param error - Original public rejection. @returns No successful value.
 */
export function rejectVerification(
  error: CandidateVerificationError,
): Effect.Effect<never, VerificationFailure> {
  return Effect.fail(new VerificationFailure({ error }));
}
