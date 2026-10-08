import type { Effect, Scope } from "effect";
import type { CliAdapterError, CliFailureError } from "../cli-errors.js";
import type { CliCommandContext } from "../main-support-types.js";

/** Selected dev invocation; the caller Scope owns its long-lived session. */
export interface DevOperations {
  /** Runs the selected development workflow until all scoped resource owners have closed.
   * @param args - Existing dev flags.
   * @param context - Invocation presentation and cancellation.
   * @returns Completion after scoped session/resource shutdown.
   */
  readonly run: (
    args: readonly string[],
    context: CliCommandContext,
  ) => Effect.Effect<void, CliAdapterError | CliFailureError, Scope.Scope>;
}
