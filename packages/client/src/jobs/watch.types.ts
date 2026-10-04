import type { ExpectedClientIdentity } from "@relkit/contracts";
import type { RunConnection, RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";

/** Complete watch sharing authority, cursor/projection fields and retry/read bounds. */
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

/**
 * Frozen external-store snapshot of connection, run and continuity evidence.
 * @typeParam Run - Application-specific run payload retained by the observation state.
 */
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

/**
 * Declared job run observation frame.
 * @typeParam Run - Application-specific run payload retained by the observation state.
 */
export type JobWatchFrame<Run = RunSnapshot> = RunWatchFrame<Run>;

/**
 * Borrowed synchronous observer of frozen job watch state.
 * @typeParam Run - Application-specific run payload retained by the observation state.
 */
export type JobWatchListener<Run = RunSnapshot> = (state: JobWatchState<Run>) => void;

/**
 * Reusable public watch owner with synchronous state and explicit Promise cleanup.
 * @typeParam Run - Application-specific run payload retained by the observation state.
 */
export interface JobWatchController<Run = RunSnapshot> {
  getSnapshot(): JobWatchState<Run>;
  subscribe(listener: JobWatchListener<Run>): () => void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  dispose(): Promise<void>;
  refetch(): Promise<void>;
}
