import type { LogLevel } from "@relkit/runtime-effect";
import type {
  AddRequest,
  AddResult,
  ApplyScaffoldContext,
  CreateScaffoldPlan,
  PromptDriver,
  ScaffoldPlan,
} from "create-relkit";

export interface CliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}
export interface CliReporter {
  readonly output: (value: unknown, human?: string) => void;
  readonly error: (code: string, message: string) => void;
}
export type CliLogger = (
  level: LogLevel,
  message: string,
  fields?: Readonly<Record<string, unknown>>,
) => void;
export interface CliCommandContext {
  readonly command: string;
  readonly args: readonly string[];
  readonly json: boolean;
  readonly signal: AbortSignal;
  readonly tty?: boolean;
  readonly io?: CliIo;
  readonly reporter: CliReporter;
  readonly log: CliLogger;
  readonly onProgress?: (message: string) => void;
  readonly ci?: boolean;
  readonly cwd?: string;
  readonly promptDriver?: PromptDriver;
  readonly interactive?: boolean;
}
export interface CreateRelkitGeneratorApi {
  readonly normalizeCreateOptions: (
    args: readonly string[],
    context: { readonly json: boolean },
  ) => unknown;
  readonly generateProject: (
    options: unknown,
    context: CliCommandContext,
  ) => unknown | Promise<unknown>;
  readonly resolveCreateOptionsDetails?: (
    args: readonly string[],
    context: {
      readonly json: boolean;
      readonly interactive: boolean;
      readonly promptDriver?: PromptDriver;
    },
  ) => Promise<{ readonly options: unknown; readonly prompted: boolean }>;
  readonly planCreate?: (
    options: unknown,
    context?: { readonly cwd?: string },
  ) => Promise<CreateScaffoldPlan>;
  readonly resolveAddRequestDetails?: (
    args: readonly string[],
    context: {
      readonly cwd?: string;
      readonly interactive: boolean;
      readonly promptDriver?: PromptDriver;
    },
  ) => Promise<{ readonly request: AddRequest; readonly prompted: boolean }>;
  readonly planAdd?: (request: AddRequest) => Promise<ScaffoldPlan>;
  readonly applyScaffoldPlan?: (
    plan: ScaffoldPlan,
    context?: ApplyScaffoldContext,
  ) => Promise<AddResult>;
}
export interface CliRuntime {
  readonly io?: CliIo;
  readonly version?: string;
  readonly tty?: boolean;
  readonly ci?: boolean;
  readonly signal?: AbortSignal;
  readonly installSignalHandlers?: boolean;
  readonly loadCreateRelkit?: () => Promise<CreateRelkitGeneratorApi>;
  readonly cwd?: string;
  readonly promptDriver?: PromptDriver;
}
export type CliFailure = Error & {
  readonly code: string;
  readonly exitCode: number;
  readonly signal?: "SIGINT" | "SIGTERM";
};
