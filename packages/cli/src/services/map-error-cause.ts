/**
 * Translates typed failures without flattening concurrent or cleanup Causes.
 * This pure composition helper adds no recovery, logging, service requirements,
 * or runtime boundary; the owning operation retains those responsibilities.
 */
import { Cause, Effect } from "effect";

/**
 * Maps every Fail reason and retains all defect/interruption siblings and annotations.
 * @typeParam E - Original typed failure contract.
 * @typeParam E2 - Translated typed failure contract.
 * @param translate - Pure boundary translation applied once to each typed reason.
 * @returns Composition preserving successful values and the original requirements.
 */
export function mapErrorCause<E, E2>(translate: (error: E) => E2) {
  return <A, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E2, R> =>
    effect.pipe(Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, translate))));
}
