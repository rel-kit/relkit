import type { JsonValue } from "./json.js";

export type {
  NamedStreamFrame,
  RunConnection,
  RunWatchFrame,
  StreamIdentity,
} from "./jobs-run-stream.js";

/** Persisted lifecycle state of a job run. */
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
/** Backward-compatible alias for a job run status. */
export type RunStatus = JobRunStatus;

/** Availability of a run result after retention and policy checks. */
export type ResultAvailability =
  | "pending"
  | "available"
  | "void"
  | "redacted"
  | "expired"
  | "not-selected"
  | "version-incompatible"
  | "unavailable";

/** Identity and acceptance metadata returned after triggering a run. */
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

/** Public error details safe to return from a job run. */
export interface JobErrorEnvelope {
  readonly code: string;
  readonly message: string;
  readonly details?: JsonValue;
  readonly retry?: "never" | "later";
  readonly afterMs?: number;
}

/** Outcome of requesting cancellation for a job run. */
export interface RunCancellationReceipt {
  readonly runId: string;
  readonly operationId: string;
  readonly outcome: "requested" | "already-terminal" | "unsupported";
  readonly requestedAt?: string;
  readonly run?: RunSnapshot;
}

/** Fields shared across all run snapshot result states. */
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

/** Discriminated run snapshot whose output exists only when available. */
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

/** Filters and pagination inputs for listing job runs. */
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

/** Per-service availability reported with a run page. */
export interface RunAvailability {
  readonly service: string;
  readonly state: "available" | "unavailable";
  readonly reason?: string;
}

/** Paginated run results and provider availability. */
export interface RunPage<Run = RunSnapshot> {
  readonly items: readonly Run[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
  readonly availability: readonly RunAvailability[];
  readonly count?: { readonly value: number; readonly accuracy: "exact" | "approximate" };
}

/** Acceptance receipt linking a retry to its original run. */
export interface RunRetryReceipt extends RunHandle {
  readonly retryOfRunId: string;
}
