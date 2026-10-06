import type { LogLevel } from "@relkit/runtime-effect";
import type {
  AddRequest,
  AddResult,
  ApplyScaffoldContext,
  CreateScaffoldPlan,
  PromptDriver,
  ScaffoldPlan,
} from "create-relkit";

/** Borrowed synchronous output sinks; the invocation never closes these streams. */
export interface CliIo {
  /** Writes one already formatted public output line. */
  readonly stdout: (line: string) => void;
  /** Writes one already formatted diagnostic line. */
  readonly stderr: (line: string) => void;
}
/** Established public JSON/human presentation contract. */
export interface CliReporter {
  /** Emits an untrusted domain result with optional human presentation. */
  readonly output: (value: unknown, human?: string) => void;
  /** Emits the established public failure code and message. */
  readonly error: (code: string, message: string) => void;
}
/** Synchronous native callback bridge to the invocation's scoped logging queue. */
export type CliLogger = (
  level: LogLevel,
  message: string,
  fields?: Readonly<Record<string, unknown>>,
) => void;
/** Borrowed command inputs; all resource owners live in the invocation's service graph. */
export interface CliCommandContext {
  /** Selected public command. */
  readonly command: string;
  /** Remaining public arguments. */
  readonly args: readonly string[];
  /** Whether output uses the established JSON protocol. */
  readonly json: boolean;
  /** Caller and native termination signals combined before prompting. */
  readonly signal: AbortSignal;
  /** Optional native terminal detection override. */
  readonly tty?: boolean;
  /** Optional borrowed output sinks. */
  readonly io?: CliIo;
  /** Public output/error projection. */
  readonly reporter: CliReporter;
  /** Synchronous callback into the scoped logger owner. */
  readonly log: CliLogger;
  /** Optional synchronous callback into the scoped status owner. */
  readonly onProgress?: (message: string) => void;
  /** Whether noninteractive continuous integration rules apply. */
  readonly ci?: boolean;
  /** Explicit working directory override. */
  readonly cwd?: string;
  /** Optional foreign prompt adapter, supplied before any prompt is admitted. */
  readonly promptDriver?: PromptDriver;
  /** Whether this invocation may ask the user for missing inputs. */
  readonly interactive?: boolean;
}
/** Narrow compatible generator SDK; domain values remain opaque until their owner validates them. */
export interface CreateRelkitGeneratorApi {
  /** Parses the generator's existing synchronous create contract. */
  readonly normalizeCreateOptions: (
    args: readonly string[],
    context: { readonly json: boolean },
  ) => unknown;
  /** Executes the generator-owned transaction with its native cancellation receipt. */
  readonly generateProject: (
    options: unknown,
    context: CliCommandContext,
  ) => unknown | Promise<unknown>;
  /** Resolves missing create inputs without adding duplicate CLI confirmation. */
  readonly resolveCreateOptionsDetails?: (
    args: readonly string[],
    context: {
      readonly json: boolean;
      readonly interactive: boolean;
      readonly signal?: AbortSignal;
      readonly promptDriver?: PromptDriver;
    },
  ) => Promise<{ readonly options: unknown; readonly prompted: boolean }>;
  /** Previews a validated create plan without mutation. */
  readonly planCreate?: (
    options: unknown,
    context?: { readonly cwd?: string },
  ) => Promise<CreateScaffoldPlan>;
  /** Resolves the existing add selection flow with caller cancellation. */
  readonly resolveAddRequestDetails?: (
    args: readonly string[],
    context: {
      readonly cwd?: string;
      readonly interactive: boolean;
      readonly signal?: AbortSignal;
      readonly promptDriver?: PromptDriver;
    },
  ) => Promise<{ readonly request: AddRequest; readonly prompted: boolean }>;
  /** Previews the existing add plan. */
  readonly planAdd?: (request: AddRequest) => Promise<ScaffoldPlan>;
  /** Applies one generator-owned add transaction and its cleanup policy. */
  readonly applyScaffoldPlan?: (
    plan: ScaffoldPlan,
    context?: ApplyScaffoldContext,
  ) => Promise<AddResult>;
}
/** Optional public invocation injection; defaults are acquired lazily by the selected domain. */
export interface CliRuntime {
  /** Borrowed public output sinks. */
  readonly io?: CliIo;
  /** Explicit package version override used by public help/version output. */
  readonly version?: string;
  /** Explicit terminal detection override. */
  readonly tty?: boolean;
  /** Explicit continuous integration mode. */
  readonly ci?: boolean;
  /** Continuing caller cancellation; never replaced by a domain-owned controller. */
  readonly signal?: AbortSignal;
  /** Whether the invocation installs temporary native termination handlers. */
  readonly installSignalHandlers?: boolean;
  /** Optional individual foreign SDK loader; unused commands never call it. */
  readonly loadCreateRelkit?: () => Promise<CreateRelkitGeneratorApi>;
  /** Explicit project discovery root. */
  readonly cwd?: string;
  /** Optional native prompt adapter retaining its original public contract. */
  readonly promptDriver?: PromptDriver;
}
/** Original public error object enriched with stable CLI status metadata. */
export type CliFailure = Error & {
  /** Stable public diagnostic code. */
  readonly code: string;
  /** Established native exit status. */
  readonly exitCode: number;
  /** Native termination signal when one caused the failure. */
  readonly signal?: "SIGINT" | "SIGTERM";
};
