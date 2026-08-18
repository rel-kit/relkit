import type { JsonValue } from "@zsys/contracts";

export const JOB_QUEUE_STATES = [
  "accepted",
  "available",
  "leased",
  "delayed",
  "completed",
  "dead-lettered",
] as const;
export type JobQueueState = (typeof JOB_QUEUE_STATES)[number];
export type JobState = JobQueueState;
export interface JobIdempotencyDefinition {
  readonly key: string;
  readonly retentionMs: number;
}

export interface JobIdempotencyRecord {
  readonly key: string;
  readonly expiresAt: number;
}

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
}

/** Durable acceptance information returned by queue admission. */
export interface JobQueueAcceptance extends JobQueueEntry {
  readonly accepted: true;
  readonly duplicate: boolean;
  readonly idempotencyKey?: string;
  readonly idempotencyExpiresAt?: number;
}

export type JobFailureKind = "application" | "provider" | "cancellation" | "timeout" | "defect";
export type JobFailureOutcome =
  "declared-error" | "provider-failure" | "cancelled" | "timeout" | "defect";
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
}
export interface JobQueueEnqueue {
  readonly input: JsonValue;
  readonly profile?: string;
  readonly instanceId?: string;
  readonly acceptedAt?: number;
  readonly idempotency?: JobIdempotencyDefinition;
}
export interface JobQueueLeaseOptions {
  readonly leaseDurationMs?: number;
  readonly leaseExpiresAt?: number;
}
export interface JobQueueTransitionOptions extends JobQueueLeaseOptions {
  readonly expectedState?: JobQueueState;
  readonly attempt?: number;
  readonly availableAt?: number;
  readonly leaseOwner?: string;
  readonly failure?: JobFailureMetadata;
}
export interface JobQueueAdminRetryOptions {
  readonly availableAt?: number;
}
export type JobQueueCounts = Readonly<Record<JobQueueState, number>>;

export interface JobQueueOptions {
  readonly now?: () => number;
  readonly createInstanceId?: () => string;
  readonly ownerToken?: string;
  readonly leaseDurationMs?: number;
  readonly idempotency?: JobIdempotencyDefinition;
}

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

export class JobQueueStateError extends Error {
  readonly code = "ZSYS_JOB_QUEUE_STATE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "JobQueueStateError";
  }
}

export const transitions: Readonly<Record<JobQueueState, readonly JobQueueState[]>> = {
  accepted: ["available"],
  available: ["leased"],
  leased: ["leased", "available", "delayed", "completed", "dead-lettered"],
  delayed: ["available"],
  completed: [],
  "dead-lettered": [],
};

export function assertTime(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new JobQueueStateError(`${label} is invalid`);
}
