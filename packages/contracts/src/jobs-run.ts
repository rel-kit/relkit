import type { JsonValue } from "./json.js";

export type JobRunStatus =
  | "queued"
  | "delayed"
  | "running"
  | "sleeping"
  | "retrying"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed-out"
  | "unknown";
export type RunStatus = JobRunStatus;

export type ResultAvailability =
  | "pending"
  | "available"
  | "void"
  | "redacted"
  | "expired"
  | "not-selected"
  | "version-incompatible"
  | "unavailable";

export interface RunHandle {
  readonly accepted: true;
  readonly runId: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly acceptedAt: string;
  readonly duplicate?: boolean;
  readonly idempotencyExpiresAt?: string;
}

export interface JobErrorEnvelope {
  readonly code: string;
  readonly message: string;
  readonly details?: JsonValue;
  readonly retry?: "never" | "later";
  readonly afterMs?: number;
}

export interface RunCancellationReceipt {
  readonly runId: string;
  readonly operationId: string;
  readonly outcome: "requested" | "already-terminal" | "unsupported";
  readonly requestedAt?: string;
  readonly run?: RunSnapshot;
}

interface RunSnapshotBase<Input, Progress, Failure> extends RunHandle {
  readonly buildId: string;
  readonly service: string;
  readonly inputHash?: string;
  readonly inputSchemaHash?: string;
  readonly scope?: string;
  readonly acceptanceIdentity?: string;
  readonly status: JobRunStatus;
  readonly observedAt: string;
  readonly resultAvailability: ResultAvailability;
  readonly attempt?: number;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly nextEligibleAt?: string;
  readonly parentRunId?: string;
  readonly retryOfRunId?: string;
  readonly scheduledFor?: string;
  readonly cancellation?: RunCancellationReceipt;
  readonly nativeDiagnosticCode?: string;
  readonly input?: Input;
  readonly progress?: Progress;
  readonly error?: Failure;
}

export type RunSnapshot<
  Input = unknown,
  Output = unknown,
  Progress = unknown,
  Failure = JobErrorEnvelope,
> =
  | (RunSnapshotBase<Input, Progress, Failure> & {
      readonly status: "completed";
      readonly resultAvailability: "available";
      readonly output: Output;
    })
  | (RunSnapshotBase<Input, Progress, Failure> & {
      readonly status: "completed";
      readonly resultAvailability: Exclude<ResultAvailability, "available">;
      readonly output?: never;
    })
  | (RunSnapshotBase<Input, Progress, Failure> & {
      readonly status: Exclude<JobRunStatus, "completed">;
      readonly output?: never;
    });

export interface RunListQuery {
  readonly status?: readonly JobRunStatus[];
  readonly jobId?: string;
  readonly taskId?: string;
  readonly taskVersion?: string;
  readonly buildId?: string;
  readonly service?: string;
  readonly acceptedFrom?: string;
  readonly acceptedTo?: string;
  readonly startedFrom?: string;
  readonly startedTo?: string;
  readonly completedFrom?: string;
  readonly completedTo?: string;
  readonly tags?: readonly string[];
  readonly tagMatch?: "all" | "any";
  readonly correlationId?: string;
  readonly parentRunId?: string;
  readonly runId?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface RunAvailability {
  readonly service: string;
  readonly state: "available" | "unavailable";
  readonly reason?: string;
}

export interface RunPage<Run = RunSnapshot> {
  readonly items: readonly Run[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
  readonly availability: readonly RunAvailability[];
  readonly count?: { readonly value: number; readonly accuracy: "exact" | "approximate" };
}

export interface RunRetryReceipt extends RunHandle {
  readonly retryOfRunId: string;
}

export type RunConnection =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "completed"
  | "unauthorized"
  | "error"
  | "disposed";

export type RunWatchFrame<Run = RunSnapshot> =
  | {
      readonly kind: "snapshot";
      readonly run: Run;
      readonly observedAt: string;
      readonly epoch: string;
      readonly sequence: number;
      readonly cursor?: string;
      readonly continuity: "state" | "history";
    }
  | {
      readonly kind: "update";
      readonly run: Run;
      readonly observedAt: string;
      readonly epoch: string;
      readonly sequence: number;
      readonly cursor?: string;
    }
  | {
      readonly kind: "reset";
      readonly run: Run;
      readonly observedAt: string;
      readonly epoch: string;
      readonly sequence: number;
      readonly reason: "reconnected" | "cursor-expired" | "history-unavailable" | "overflow";
      readonly cursor?: string;
    };

export interface StreamIdentity {
  readonly runId: string;
  readonly name: string;
  readonly attempt: number;
  readonly generation: string;
  readonly schemaVersion: string;
}

export type NamedStreamFrame<Item = JsonValue> =
  | (StreamIdentity & { readonly kind: "start" })
  | (StreamIdentity & {
      readonly kind: "chunk";
      readonly sequence: number;
      readonly item: Item;
      readonly cursor?: string;
    })
  | (StreamIdentity & {
      readonly kind: "reset";
      readonly reason: "reconnected" | "cursor-expired" | "overflow";
    })
  | (StreamIdentity & { readonly kind: "end" });
