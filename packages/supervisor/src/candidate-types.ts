import type { SupervisorCandidateToken } from "./state-machine-types.js";

export interface CandidateCompileRequest {
  readonly token: SupervisorCandidateToken;
  readonly projectRoot: string;
  readonly outputDirectory: string;
  readonly signal: AbortSignal;
}

export interface CandidateCompileResult {
  readonly entrypoint: string;
}

export type CandidateCompile = (
  request: CandidateCompileRequest,
) => CandidateCompileResult | PromiseLike<CandidateCompileResult>;

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

export type CandidateLogger = (event: CandidateLogEvent) => void;

export interface CandidateOptions {
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
  readonly allocatePort?: (hostname: string) => Promise<number>;
  readonly logger?: CandidateLogger;
}

export interface CompiledCandidate {
  readonly token: SupervisorCandidateToken;
  readonly directory: string;
  readonly entrypoint: string;
  readonly cleanup: () => Promise<void>;
}

export interface CandidateOutput {
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
}

export interface StartedCandidate extends CompiledCandidate {
  readonly port: number;
  readonly pid: number;
  readonly process: Bun.ReadableSubprocess;
  readonly exited: Promise<number>;
  readonly output: Promise<CandidateOutput>;
  readonly stop: () => Promise<void>;
  readonly dispose: () => Promise<void>;
}
