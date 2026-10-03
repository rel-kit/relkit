import { Effect } from "effect";
import { HttpBoundaryError } from "./http-effect.js";

/** Adapts an existing public input validator into the typed HTTP failure channel.
 * @typeParam A - Validated value returned by the existing validator.
 * @param operation - Bounded validation operation name.
 * @param validate - Public input validator whose documented exceptions are expected failures.
 * @returns A lazy validation effect retaining the original public exception as its cause.
 * @remarks Use only for known boundary validators. Internal calculations use Effect.sync so
 * programmer exceptions remain defects.
 */
export function httpValidation<A>(operation: string, validate: () => A) {
  return Effect.try({
    try: validate,
    catch: (cause) => new HttpBoundaryError({ operation, cause }),
  });
}
