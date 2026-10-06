import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { DeployCommandError } from "../commands/deploy-support.js";
import type {
  DeployContext,
  DeployExecutionResult,
  ParsedDeployArgs,
} from "../commands/deploy-support.types.js";

/** Deployment planning/execution authority, separate from argument parsing/presentation. */
export interface DeploymentCapabilities {
  /**
   * Plans and executes one explicit operation without mutation retries.
   * @param root - Absolute project root.
   * @param parsed - Validated stack/backend/options.
   * @param context - Existing optional provider-event sink.
   * @returns Portable success/decline data, or typed SDK/cohort failures.
   */
  readonly run: (
    root: string,
    parsed: ParsedDeployArgs,
    context: DeployContext,
  ) => Effect.Effect<DeployExecutionResult, CliAdapterError | DeployCommandError>;
}
