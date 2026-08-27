import { PROTOCOL_VERSION, type MaybePromise } from "@relkit/contracts";
import type { JobFailureMetadata, JobQueueCounts, JobQueueState } from "./queue-utils.js";

export const JOB_ADMIN_PROTOCOL = "relkit.jobs.admin" as const;
export const JOB_ADMIN_VERSION = PROTOCOL_VERSION;

export type JobAdminMode = "development" | "test" | "production";
export type JobAdminAction = "retry" | "cancel" | "dead-letter";
export type JobAdminActionOutcome = "applied" | "rejected";

export interface JobAdminVersion {
  readonly protocol: typeof JOB_ADMIN_PROTOCOL;
  readonly version: typeof JOB_ADMIN_VERSION;
}

/** Safe, versioned state returned to inspector consumers. */
export interface JobStatusContract extends JobAdminVersion {
  readonly instanceId: string;
  readonly state: JobQueueState;
  readonly profile: string;
  readonly attempt: number;
  readonly acceptedAt: number;
  readonly order: number;
  readonly availableAt?: number;
  readonly leaseExpiresAt?: number;
  readonly idempotencyExpiresAt?: number;
  readonly failure?: JobFailureMetadata;
}

export interface JobQueryRequest {
  readonly protocol?: typeof JOB_ADMIN_PROTOCOL;
  readonly version?: typeof JOB_ADMIN_VERSION;
  readonly instanceId?: string;
  readonly state?: JobQueueState;
  readonly states?: readonly JobQueueState[];
  readonly cursor?: string;
  readonly limit?: number;
}

export interface JobQueryContract extends JobAdminVersion {
  readonly items: readonly JobStatusContract[];
  readonly counts: JobQueueCounts;
  readonly nextCursor?: string;
}

export interface JobActionRequest {
  readonly protocol?: typeof JOB_ADMIN_PROTOCOL;
  readonly version?: typeof JOB_ADMIN_VERSION;
  readonly instanceId: string;
  readonly reason?: string;
}

export type JobRetryRequest = JobActionRequest;
export type JobCancelRequest = JobActionRequest;
export type JobDeadLetterRequest = JobActionRequest;

export interface JobAdminActionRecord extends JobAdminVersion {
  readonly actionId: string;
  readonly action: JobAdminAction;
  readonly instanceId: string;
  readonly mode: JobAdminMode;
  readonly outcome: JobAdminActionOutcome;
  readonly requestedAt: number;
  readonly fromState?: JobQueueState;
  readonly toState?: JobQueueState;
  readonly errorCode?: string;
  readonly reason?: string;
}

export interface JobActionContract extends JobAdminVersion {
  readonly action: JobAdminAction;
  readonly status: JobStatusContract;
  readonly record: JobAdminActionRecord;
}

export type JobAdminActionSink = (record: JobAdminActionRecord) => MaybePromise<void>;
