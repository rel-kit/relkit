/** Joins finite native filesystem and packed SDK calls before scaffold fixture ownership can end. */
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { ScaffoldProcessFailure } from "./scaffold-process.errors.js";

/**
 * Adapts a finite native operation without a cancellation interface.
 * @typeParam A - Exact native or SDK success contract.
 * @param operation - Fixed acceptance stage for diagnostics and instrumentation.
 * @param run - Finite operation whose settlement must precede fixture cleanup.
 * @returns Observed success or a tagged expected failure; interruption waits for native settlement.
 */
export function scaffoldNative<A>(operation: string, run: () => Promise<A>) {
  return observeExecution(
    "testing",
    "scaffold." + operation,
    Effect.tryPromise({
      try: run,
      catch: (cause) =>
        new ScaffoldProcessFailure({
          operation,
          message: cause instanceof Error ? cause.message : "Native scaffold operation failed",
        }),
    }).pipe(Effect.uninterruptible),
  );
}
