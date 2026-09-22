import type { ExpectedClientIdentity } from "@relkit/contracts";
import type { RunConnection, RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";

export interface JobWatchOptions {
  readonly runId: string;
  readonly jobId?: string;
  readonly after?: string;
  readonly expectedIdentity?: ExpectedClientIdentity;
  readonly identityKey?: string | null;
  readonly applicationId?: string;
  readonly environment?: string;
  readonly grantScope?: string;
  readonly projection?: string;
  readonly schemaVersion?: string;
  readonly protocolVersion?: number;
  readonly source?: "native" | "polling";
  readonly pollIntervalMs?: number;
  readonly maxReconnectAttempts?: number;
  readonly reconnectMinDelayMs?: number;
  readonly reconnectMaxDelayMs?: number;
  readonly readTimeoutMs?: number;
}

export interface JobWatchState<Run = RunSnapshot> {
  readonly run?: Run;
  readonly connection: RunConnection;
  readonly isStale: boolean;
  readonly lastObservedAt?: string;
  readonly connectionError?: unknown;
  readonly continuity?: "state" | "history";
  readonly resetReason?: "reconnected" | "cursor-expired" | "history-unavailable" | "overflow";
  readonly source?: "native" | "polling";
  readonly epoch?: string;
  readonly sequence?: number;
  readonly cursor?: string;
}

export type JobWatchFrame<Run = RunSnapshot> = RunWatchFrame<Run>;
export type JobWatchListener<Run = RunSnapshot> = (state: JobWatchState<Run>) => void;

export interface JobWatchController<Run = RunSnapshot> {
  getSnapshot(): JobWatchState<Run>;
  subscribe(listener: JobWatchListener<Run>): () => void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  dispose(): Promise<void>;
  refetch(): Promise<void>;
}

export class JobWatchDisposedError extends Error {
  readonly code = "RELKIT_JOB_WATCH_DISPOSED" as const;

  constructor() {
    super("The job watch has been permanently disposed.");
    this.name = "JobWatchDisposedError";
  }
}

export class JobWatchAbortedError extends Error {
  readonly code = "RELKIT_JOB_WATCH_ABORTED" as const;

  constructor() {
    super("The job watch connection was interrupted before setup completed.");
    this.name = "JobWatchAbortedError";
  }
}

export class JobWatchUnavailableError extends Error {
  readonly code = "RELKIT_JOB_WATCH_UNAVAILABLE" as const;

  constructor() {
    super("A usable run identity is required before observing a job.");
    this.name = "JobWatchUnavailableError";
  }
}

export class JobWatchReadTimeoutError extends Error {
  readonly code = "RELKIT_JOB_WATCH_READ_TIMEOUT" as const;

  constructor() {
    super("The job watch read exceeded its bounded timeout.");
    this.name = "JobWatchReadTimeoutError";
  }
}

export function isTerminalRun(run: unknown): boolean {
  if (run === null || typeof run !== "object") return false;
  const status = (run as { readonly status?: unknown }).status;
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "timed-out"
  );
}
