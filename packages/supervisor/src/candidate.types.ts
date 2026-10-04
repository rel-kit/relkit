import type { SupervisorCandidateToken } from "./state-machine.types.js";
import type { LoggerOptions } from "@relkit/runtime-effect/logger";

/** Native compiler inputs restricted to one owned generation directory. */
export interface CandidateCompileRequest {
  readonly token: SupervisorCandidateToken;
  readonly projectRoot: string;
  readonly outputDirectory: string;
  readonly signal: AbortSignal;
}

/** Compiler-selected relative entrypoint and native environment additions. */
export interface CandidateCompileResult {
  readonly entrypoint: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

/** Compiles one generation. @param request - Owned identity, directory and cancellation.
 * @returns Native build settlement; owners join settlement before directory removal. */
export type CandidateCompile = (
  request: CandidateCompileRequest,
) => CandidateCompileResult | PromiseLike<CandidateCompileResult>;

/** Existing native lifecycle/output sink record, retained for CLI compatibility. */
export interface CandidateLogEvent {
  readonly level: "info" | "warn" | "error";
  readonly event:
    | "candidate.compile.started"
    | "candidate.compile.succeeded"
    | "candidate.compile.failed"
    | "candidate.start.started"
    | "candidate.start.succeeded"
    | "candidate.start.failed"
    | "candidate.startup-output"
    | "candidate.process-exited";
  readonly token: SupervisorCandidateToken;
  readonly directory: string;
  readonly stream?: "stdout" | "stderr";
  readonly output?: string;
  readonly fields?: Readonly<Record<string, string | number | boolean>>;
}

/** Consumes native candidate evidence. @param event - Immutable bounded lifecycle/output record. */
export type CandidateLogger = (event: CandidateLogEvent) => void;

/** Once-acquired candidate dependencies and explicit native resource policy. */
export interface CandidateOptions {
  readonly operationLogger?: LoggerOptions;
  readonly projectRoot: string;
  readonly token: SupervisorCandidateToken;
  readonly compile: CandidateCompile;
  readonly generatedDirectory?: string;
  readonly hostname?: string;
  readonly port?: number;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly maxStartupOutputBytes?: number;
  readonly stopTimeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Allocates an exclusive backend port. @param hostname - Native host. @returns A usable private port. */
  readonly allocatePort?: (hostname: string) => Promise<number>;
  readonly logger?: CandidateLogger;
}

/** Generation-owned compiled directory, entrypoint and exactly-once cleanup. */
export interface CompiledCandidate {
  readonly token: SupervisorCandidateToken;
  readonly directory: string;
  readonly entrypoint: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  /** Removes this owner's directory after its work settles. @returns Shared filesystem cleanup completion. */
  readonly cleanup: () => Promise<void>;
}

/** Bounded retained stdout/stderr diagnostics; native consumption continues beyond the byte budget. */
export interface CandidateOutput {
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
}

/** Native process and distinct output/exit/stop lifetimes owned by the candidate scope. */
export interface StartedCandidate extends CompiledCandidate {
  readonly port: number;
  readonly pid: number;
  readonly process: Bun.ReadableSubprocess;
  readonly exited: Promise<number>;
  readonly output: Promise<CandidateOutput>;
  /** Stops the child and joins physical exit. @returns Shared native process termination. */
  readonly stop: () => Promise<void>;
  /** Releases the complete generation owner. @returns Completion after process, output and directory cleanup. */
  readonly dispose: () => Promise<void>;
}
