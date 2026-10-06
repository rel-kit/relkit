import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";

/** Separate confirmation authority; preview cannot perform destructive SDK mutations. */
export interface DeployConfirmationCapabilities {
  /**
   * Asks one question and owns its native prompt lifetime.
   * @param question - Domain-owned destructive/security change summary.
   * @returns The user's decision, preserving cancellation and native failures.
   */
  readonly confirm: (question: string) => Effect.Effect<boolean, CliAdapterError>;
}
