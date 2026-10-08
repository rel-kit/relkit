import type { CliCommandContext } from "../main-support.js";

/** Existing local operation reporter and optional invocation cancellation. */
export type LocalOperationContext = Pick<CliCommandContext, "reporter" | "signal">;
/** Existing local command presentation and interaction policy. */
export type LocalCommandContext = Pick<CliCommandContext, "json" | "reporter" | "signal" | "tty">;
/** Authorized compatibility confirmation substitute. */
export interface LocalCommandDependencies {
  /**
   * Retains an explicitly injected confirmation callback at the native prompt edge.
   * @param message - Local reset ownership/removal summary.
   * @returns The caller's decision; command orchestration owns its joined settlement.
   */
  readonly confirm?: (message: string) => boolean | Promise<boolean>;
}
/** Parsed local arguments, independent of acquiring native mutation authority. */
export interface ParsedLocalArgs {
  readonly command: "up" | "status" | "stop" | "reset";
  readonly projectRoot: string;
  readonly detach: boolean;
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly service?: string;
  readonly environment?: string;
}
