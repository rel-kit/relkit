/** Preserves auth failures, mixed causes and native leases at the Promise boundary. */
import {
  inheritNativeLeases,
  runSpecializedTrace,
  squashDrizzleCause,
} from "@relkit/drizzle/internal";
import { Cause, Effect, Exit, type ManagedRuntime } from "effect";
import { AuthFailure } from "./auth.errors.js";

/**
 * Runs the Promise boundary, unwrapping expected auth failures.
 * @typeParam A - Successful operation result.
 * @typeParam E - Effect failure channel.
 * @typeParam R - Runtime's provided services.
 * @typeParam ER - Runtime acquisition failures.
 * @param runtime - Managed auth owner.
 * @param effect - Lazy operation preserving defects and interruption.
 * @param options - Request cancellation forwarded to the runner.
 * @param operation - Bounded invocation label; the trace captures no SDK result.
 * @returns Promise preserving native exception identity and mixed causes.
 * @internal
 */
export function runAuthPromise<A, E, R, ER>(
  runtime: ManagedRuntime.ManagedRuntime<R, ER>,
  effect: Effect.Effect<A, E, R>,
  options?: Effect.RunOptions,
  operation = "auth.api",
): Promise<A> {
  const admittedEffect = inheritNativeLeases(effect);
  return runSpecializedTrace(operation, async () => {
    const exit = await runtime.runPromiseExit(admittedEffect, options);
    if (Exit.isSuccess(exit)) return exit.value;
    // Unwrap auth causes before the shared renderer retains every cleanup/interrupt reason.
    throw squashDrizzleCause(
      Cause.map(exit.cause, (failure) =>
        failure instanceof AuthFailure ? failure.cause : failure,
      ),
    );
  });
}
