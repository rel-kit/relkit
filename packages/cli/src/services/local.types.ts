import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { LocalCommandError } from "../commands/local-operation-support.js";
import type { LocalCommandContext, ParsedLocalArgs } from "../commands/local.types.js";

/** Local container/state workflows with all native authority captured at acquisition. */
export interface LocalCapabilities {
  /**
   * Runs one selected operation and owns its lease/reconciler/prompt scopes.
   * @param parsed - Validated local operation flags.
   * @param context - Existing reporting/interaction policy.
   * @returns The established command exit status or an expected SDK/cohort failure.
   */
  readonly run: (
    parsed: ParsedLocalArgs,
    context: LocalCommandContext,
  ) => Effect.Effect<number, CliAdapterError | LocalCommandError>;
}
