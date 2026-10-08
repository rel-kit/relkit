import type { Effect } from "effect";
import type { GeneratorProcessError } from "./generator-errors.js";

/** Captured process result, matching both existing command-runner compatibility contracts. */
export interface GeneratorCommandResult {
  readonly exitCode: number;
  readonly stdout?: string;
  readonly stderr?: string;
}

/** Explicit process-spawning authority. Each invocation owns its child through completion. */
export interface GeneratorProcessService {
  /**
   * Owns one command, output drains and child settlement through scope release.
   * @param command - Literal executable and argument vector.
   * @param cwd - Working directory for the operation.
   * @returns Captured output and exit status after child settlement and scoped cleanup.
   */
  readonly run: (
    command: readonly string[],
    cwd: string,
  ) => Effect.Effect<GeneratorCommandResult, GeneratorProcessError>;
  /**
   * Locates an executable through the native process adapter.
   * @param executable - Executable name resolved through the native search path.
   * @returns Executable path, or null when unavailable.
   */
  readonly which: (executable: string) => Effect.Effect<string | null, GeneratorProcessError>;
}

/** Existing external runner adapter; its signal is aborted when the owning fiber is interrupted. */
export type GeneratorCommandRunner = (
  command: readonly string[],
  cwd: string,
  signal?: AbortSignal,
) => Promise<GeneratorCommandResult>;
