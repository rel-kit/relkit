import { Effect } from "effect";

/** Adapts known pure candidate guards without turning unexpected defects into failures.
 * @typeParam T - Validated result. @param validate - Existing compatibility guard.
 * @returns The value or original expected validation error in the failure channel. */
export function validateCandidate<T>(validate: () => T): Effect.Effect<T, Error> {
  return Effect.try({
    try: validate,
    catch: (error) => {
      if (
        error instanceof TypeError ||
        error instanceof RangeError ||
        (error instanceof Error &&
          error.message === "Candidate entrypoint must remain inside its generation directory.")
      )
        return error;
      throw error;
    },
  });
}

/** Preserves caller abort reasons as typed failures without aborting the caller controller.
 * @param signal - Borrowed caller signal. @returns A failure only when that signal is already aborted. */
export function checkCandidateAbort(signal: AbortSignal | undefined): Effect.Effect<void, unknown> {
  return Effect.suspend(() =>
    signal?.aborted
      ? Effect.fail(signal.reason ?? new Error("Candidate operation was aborted."))
      : Effect.void,
  );
}
