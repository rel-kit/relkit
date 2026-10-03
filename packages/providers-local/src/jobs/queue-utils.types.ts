import type { JsonValue, TracePropagation } from "@relkit/contracts";
import type { JOB_QUEUE_STATES } from "./queue-utils.js";

/** Persisted lifecycle states supported by the local durable queue. */
export type JobQueueState = (typeof JOB_QUEUE_STATES)[number];

/** Compatibility alias for the durable queue lifecycle state. */
export type JobState = JobQueueState;

/** Caller deduplication identity and retention policy for a queue acceptance. */
export interface JobIdempotencyDefinition {
  readonly key: string;
  readonly retentionMs: number;
}

/** Persisted acceptance identity and expiry used for deduplication. */
export interface JobIdempotencyRecord {
  readonly key: string;
  readonly expiresAt: number;
}

/** Durable queue state including acceptance, lease, retry and failure metadata. */
export interface JobQueueEntry {
  readonly instanceId: string;
  readonly state: JobQueueState;
  readonly input: JsonValue;
  readonly profile: string;
  readonly attempt: number;
  readonly acceptedAt: number;
  readonly order: number;
  readonly availableAt?: number;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: number;
  readonly idempotency?: JobIdempotencyRecord;
  readonly failure?: JobFailureMetadata;
  readonly propagation?: TracePropagation;
}

/** In-memory queue index and next acceptance order owned by serialized mutations. */
export interface MutableQueueState {
  readonly entries: Map<string, JobQueueEntry>;
  nextOrder: number;
}

/** Durable acceptance information returned by queue admission. */
export interface JobQueueAcceptance extends JobQueueEntry {
  readonly accepted: true;
  readonly duplicate: boolean;
  readonly idempotencyKey?: string;
  readonly idempotencyExpiresAt?: number;
}

/** Public classification of a failed queue attempt. */
export type JobFailureKind = "application" | "provider" | "cancellation" | "timeout" | "defect";

/** Public terminal or retry outcome of a failed queue attempt. */
export type JobFailureOutcome =
  "declared-error" | "provider-failure" | "cancelled" | "timeout" | "defect";

/** Retry hint retained in safe failure metadata. */
export type JobFailureRetry = "never" | "later";

/** Public, JSON-safe failure data retained with a delayed or dead-lettered job. */
export interface JobFailureMetadata {
  readonly kind: JobFailureKind;
  readonly outcome: JobFailureOutcome;
  readonly code: string;
  readonly message: string;
  readonly data?: JsonValue;
  readonly status?: number;
  readonly retry?: JobFailureRetry;
  readonly afterMs?: number;
}

/** Input required to accept a job into the local durable queue. */
export interface JobQueueEnqueue {
  readonly input: JsonValue;
  readonly profile?: string;
  readonly instanceId?: string;
  readonly acceptedAt?: number;
  readonly idempotency?: JobIdempotencyDefinition;
  readonly propagation?: TracePropagation;
}

/** Caller ownership and duration settings for acquiring a lease. */
export interface JobQueueLeaseOptions {
  readonly leaseDurationMs?: number;
  readonly leaseExpiresAt?: number;
}

/** Expected state, ownership and metadata for a durable transition. */
export interface JobQueueTransitionOptions extends JobQueueLeaseOptions {
  readonly expectedState?: JobQueueState;
  readonly attempt?: number;
  readonly availableAt?: number;
  readonly leaseOwner?: string;
  readonly failure?: JobFailureMetadata;
}

/** Administrative retry preconditions and next-availability settings. */
export interface JobQueueAdminRetryOptions {
  readonly availableAt?: number;
}

/** Entry counts grouped by durable queue lifecycle state. */
export type JobQueueCounts = Readonly<Record<JobQueueState, number>>;

/** Clock, persistence and policy options for a local queue. */
export interface JobQueueOptions {
  readonly now?: () => number;
  readonly createInstanceId?: () => string;
  readonly ownerToken?: string;
  readonly leaseDurationMs?: number;
  readonly idempotency?: JobIdempotencyDefinition;
}

/** Promise mutation and synchronous inspection contract for one durable queue. */
export interface JobQueue {
  readonly ownerToken: string;
  readonly ready: () => Promise<void>;
  readonly enqueue: (input: JobQueueEnqueue) => Promise<JobQueueAcceptance>;
  readonly acquire: (
    instanceId?: string,
    options?: JobQueueLeaseOptions,
  ) => Promise<JobQueueEntry | undefined>;
  readonly renew: (instanceId: string, options?: JobQueueLeaseOptions) => Promise<JobQueueEntry>;
  readonly transition: (
    instanceId: string,
    state: JobQueueState,
    options?: JobQueueTransitionOptions,
  ) => Promise<JobQueueEntry>;
  /** Requeues one dead letter as a fresh attempt without widening normal transitions. */
  readonly adminRetry: (
    instanceId: string,
    options?: JobQueueAdminRetryOptions,
  ) => Promise<JobQueueEntry>;
  /** Moves one eligible nonterminal entry to a dead letter with safe metadata. */
  readonly adminDeadLetter: (
    instanceId: string,
    failure: JobFailureMetadata,
  ) => Promise<JobQueueEntry>;
  readonly recover: (now?: number) => Promise<readonly JobQueueEntry[]>;
  readonly expire: (now?: number) => Promise<readonly JobQueueEntry[]>;
  readonly selectAvailable: (limit?: number, now?: number) => readonly JobQueueEntry[];
  readonly get: (instanceId: string) => JobQueueEntry | undefined;
  readonly counts: () => JobQueueCounts;
  readonly snapshot: () => readonly JobQueueEntry[];
}
