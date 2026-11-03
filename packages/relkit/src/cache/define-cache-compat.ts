import { Cause, Effect, Exit } from "effect";
import { CacheDescriptorError } from "./define-cache-error.js";

/** Runs a descriptor Effect and restores established synchronous errors.
 * @param effect - Descriptor construction or assertion.
 * @returns The successful descriptor result.
 * @throws The original shared-contract error or TypeError for invalid input.
 * @example runDescriptor(Effect.succeed(1));
 */
export function runDescriptor<A>(effect: Effect.Effect<A, CacheDescriptorError>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const cause = Cause.squash(exit.cause);
  if (cause instanceof CacheDescriptorError) {
    if (cause.cause !== undefined) throw cause.cause;
    throw new TypeError(cause.message);
  }
  throw cause;
}
