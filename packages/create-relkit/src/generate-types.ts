import type { AddResult, ScaffoldWarning } from "./add-types.js";
import type { CreateOptions } from "./options.js";
import type { PromptDriver } from "./prompt-driver.js";
import type { GenerateNextSteps } from "./generate-output.js";

/**
 * Native process exit status and captured standard output/error.
 */
export interface GenerateCommandResult {
  readonly exitCode: number;
  readonly stdout?: string;
  readonly stderr?: string;
}

/**
 * Existing Promise process adapter receiving literal arguments, cwd and optional cancellation.
 */
export type GenerateCommandRunner = (
  command: readonly string[],
  cwd: string,
  signal?: AbortSignal,
) => Promise<GenerateCommandResult>;

/**
 * Named generation stages available for deterministic failure injection.
 */
export type GenerateFailurePoint =
  "copy" | "substitute" | "install" | "git" | "doctor" | "check" | "rename";

/**
 * Caller-owned templates, process/prompt adapters, cancellation and progress settings.
 */
export interface GenerateProjectContext {
  readonly cwd?: string;
  readonly templateRoot?: string;
  readonly commandRunner?: GenerateCommandRunner;
  readonly bunExecutable?: string;
  readonly gitExecutable?: string;
  readonly relkitExecutable?: string;
  readonly signal?: AbortSignal;
  /**
   * Reports the current step through the caller's progress sink.
   * @param message - User-facing progress text for the current step.
   * @returns Completion after the sink receives one progress message.
   */
  readonly onProgress?: (message: string) => void;
  /**
   * Injects a failure at a named stage for deterministic generation tests.
   * @param point - Fixed deterministic generation failure-injection point.
   * @returns Completion after the hook runs; a thrown failure aborts that stage.
   */
  readonly failAt?: (point: GenerateFailurePoint) => void;
  readonly interactive?: boolean;
  readonly promptDriver?: PromptDriver;
}

/**
 * Published project's options, destination, files, warnings and local next steps.
 */
export interface GenerateProjectResult {
  readonly ok: true;
  readonly command: "create";
  readonly name: string;
  readonly template: CreateOptions["template"];
  readonly cloud: CreateOptions["cloud"];
  readonly deploy: CreateOptions["deploy"];
  readonly destination: string;
  readonly files: readonly string[];
  readonly installed: boolean;
  readonly gitInitialized: boolean;
  readonly additions: readonly AddResult[];
  readonly warnings: readonly ScaffoldWarning[];
  readonly nextSteps: GenerateNextSteps;
}

/**
 * Public generation failure carrying its diagnostic code, exit status and optional staging path.
 */
export class GenerateProjectError extends Error {
  readonly exitCode: 1 | 2 | 130 | 143;
  readonly temporaryPath: string | undefined;

  /**
   * Creates a public generation failure retaining its temporary-path details.
   * @param code - Stable generation or validation diagnostic code.
   * @param message - User-facing diagnostic or prompt text.
   * @param temporaryPath - Staging directory retained in diagnostic output, when present.
   * @param exitCode - Supported process exit code, defaulting from the public code.
   * @returns The canonical public error instance.
   */
  constructor(
    readonly code: string,
    message: string,
    temporaryPath?: string,
    exitCode: 1 | 2 | 130 | 143 = defaultExitCode(code),
  ) {
    super(message);
    this.temporaryPath = temporaryPath;
    this.exitCode = exitCode;
    this.name = "GenerateProjectError";
  }
}

/**
 * Maps usage and cancellation codes to their stable exit statuses.
 * @param code - Public diagnostic code.
 * @returns 2 for usage, 130 for cancellation/interruption, otherwise 1.
 */
function defaultExitCode(code: string): 1 | 2 | 130 {
  if (code.endsWith("_USAGE")) return 2;
  if (code.endsWith("_CANCELLED") || code === "RELKIT_INTERRUPTED") return 130;
  return 1;
}
