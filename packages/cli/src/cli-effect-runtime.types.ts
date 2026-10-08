import type { CliError } from "effect/cli";

/** A selected command and its normalized, immutable arguments. */
export interface CliInvocation {
  readonly command: string;
  readonly args: readonly string[];
}

/** One parser result; product handlers have not executed. */
export interface CliParseResult {
  readonly argv: readonly string[];
  readonly invocation?: CliInvocation;
  readonly error?: CliError.CliError;
  readonly stdout: string;
  readonly stderr: string;
  readonly helpPath: readonly string[];
}
