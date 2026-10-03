import type { MaybePromise } from "@relkit/contracts";
import type { JobFailureMetadata, JobQueueCounts, JobQueueState } from "./queue-utils.js";
import type { JOB_ADMIN_PROTOCOL, JOB_ADMIN_VERSION } from "./admin-contracts.js";

/** Environment mode controlling local administration mutations. */
export type JobAdminMode = "development" | "test" | "production";

/** Supported audited queue administration action. */
export type JobAdminAction = "retry" | "cancel" | "dead-letter";

/** Whether an administration action was applied or rejected. */
export type JobAdminActionOutcome = "applied" | "rejected";

/** Protocol identity carried by job administration contracts. */
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

/** Optional identity, state and pagination filters for job inspection. */
export interface JobQueryRequest {
  readonly protocol?: typeof JOB_ADMIN_PROTOCOL;
  readonly version?: typeof JOB_ADMIN_VERSION;
  readonly instanceId?: string;
  readonly state?: JobQueueState;
  readonly states?: readonly JobQueueState[];
  readonly cursor?: string;
  readonly limit?: number;
}

/** Versioned bounded page of safe job status records. */
export interface JobQueryContract extends JobAdminVersion {
  readonly items: readonly JobStatusContract[];
  readonly counts: JobQueueCounts;
  readonly nextCursor?: string;
}

/** Base job administration request with target identity and audit reason. */
export interface JobActionRequest {
  readonly protocol?: typeof JOB_ADMIN_PROTOCOL;
  readonly version?: typeof JOB_ADMIN_VERSION;
  readonly instanceId: string;
  readonly reason?: string;
}

/** Job retry request with optional policy override. */
export type JobRetryRequest = JobActionRequest;

/** Job cancellation request with optional audit reason. */
export type JobCancelRequest = JobActionRequest;

/** Job dead-letter request with optional audit reason. */
export type JobDeadLetterRequest = JobActionRequest;

/** Immutable audit record retained for each applied or rejected job action. */
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

/** Versioned job mutation result including status and audit record. */
export interface JobActionContract extends JobAdminVersion {
  readonly action: JobAdminAction;
  readonly status: JobStatusContract;
  readonly record: JobAdminActionRecord;
}

/** Optional notification sink whose rejection cannot change the action outcome. */
export type JobAdminActionSink = (record: JobAdminActionRecord) => MaybePromise<void>;
