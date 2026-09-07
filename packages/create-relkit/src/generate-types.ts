import type { AddResult, ScaffoldWarning } from "./add-types.js";
import type { CreateOptions } from "./options.js";
import type { PromptDriver } from "./prompt-driver.js";
import type { GenerateNextSteps } from "./generate-output.js";

export interface GenerateCommandResult {
  readonly exitCode: number;
  readonly stdout?: string;
  readonly stderr?: string;
}

export type GenerateCommandRunner = (
  command: readonly string[],
  cwd: string,
  signal?: AbortSignal,
) => Promise<GenerateCommandResult>;

export type GenerateFailurePoint =
  "copy" | "substitute" | "install" | "git" | "doctor" | "check" | "rename";

export interface GenerateProjectContext {
  readonly cwd?: string;
  readonly templateRoot?: string;
  readonly commandRunner?: GenerateCommandRunner;
  readonly bunExecutable?: string;
  readonly gitExecutable?: string;
  readonly relkitExecutable?: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (message: string) => void;
  readonly failAt?: (point: GenerateFailurePoint) => void;
  readonly interactive?: boolean;
  readonly promptDriver?: PromptDriver;
}

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

export class GenerateProjectError extends Error {
  readonly exitCode: 1 | 2 | 130 | 143;
  readonly temporaryPath: string | undefined;

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

function defaultExitCode(code: string): 1 | 2 | 130 {
  if (code.endsWith("_USAGE")) return 2;
  if (code.endsWith("_CANCELLED") || code === "RELKIT_INTERRUPTED") return 130;
  return 1;
}
