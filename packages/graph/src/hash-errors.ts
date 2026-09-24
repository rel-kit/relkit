import { JsonValueError, SourceLocationError } from "@relkit/contracts";
import { Data, Effect } from "effect";
import { runGraph } from "./graph-observability.js";
import type { HashFailure } from "./hash-errors.types.js";

/** Tagged failure for invalid graph shape or non-plain graph values.
 * @example Effect.catchTag("GraphCanonicalizationError", (error) => Effect.logWarning(error.message));
 */
export class GraphCanonicalizationError extends Data.TaggedError("GraphCanonicalizationError")<{
  readonly message: string;
}> {}

/**
 * Preserves known canonicalization failures and treats other exceptions as defects.
 * @param error - Caught exception from canonicalization or serialization.
 * @returns A failed Effect for a known domain error; an unknown exception dies.
 * @example Effect.runSync(Effect.flip(knownFailure(new GraphCanonicalizationError({ message: "invalid" }))));
 */
export function knownFailure(error: unknown): Effect.Effect<never, HashFailure> {
  if (
    error instanceof GraphCanonicalizationError ||
    error instanceof SourceLocationError ||
    error instanceof JsonValueError
  )
    return Effect.fail(error);
  return Effect.die(error);
}

/**
 * Restores the historical TypeError for synchronous graph shape failures.
 * @param effect - Graph hash Effect to run.
 * @returns The successful hash operation result.
 * @throws TypeError for an invalid graph shape; other errors and defects are preserved.
 * @example runHash(Effect.succeed("sha256:abc"));
 */
export function runHash<A>(effect: Effect.Effect<A, HashFailure>): A {
  try {
    return runGraph(effect);
  } catch (error) {
    if (error instanceof GraphCanonicalizationError) throw new TypeError(error.message);
    throw error;
  }
}
