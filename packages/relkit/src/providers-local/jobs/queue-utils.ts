import type {
  JobQueueState,
  JobState,
  JobIdempotencyDefinition,
  JobIdempotencyRecord,
  JobQueueEntry,
  MutableQueueState,
  JobQueueAcceptance,
  JobFailureKind,
  JobFailureOutcome,
  JobFailureRetry,
  JobFailureMetadata,
  JobQueueEnqueue,
  JobQueueLeaseOptions,
  JobQueueTransitionOptions,
  JobQueueAdminRetryOptions,
  JobQueueCounts,
  JobQueueOptions,
  JobQueue,
} from "./queue-utils.types.js";
export type {
  JobQueueState,
  JobState,
  JobIdempotencyDefinition,
  JobIdempotencyRecord,
  JobQueueEntry,
  MutableQueueState,
  JobQueueAcceptance,
  JobFailureKind,
  JobFailureOutcome,
  JobFailureRetry,
  JobFailureMetadata,
  JobQueueEnqueue,
  JobQueueLeaseOptions,
  JobQueueTransitionOptions,
  JobQueueAdminRetryOptions,
  JobQueueCounts,
  JobQueueOptions,
  JobQueue,
} from "./queue-utils.types.js";

export const JOB_QUEUE_STATES = [
  "accepted",
  "available",
  "leased",
  "delayed",
  "completed",
  "dead-lettered",
] as const;

/** Preserves the public job queue state error identity and stable error code. */
export class JobQueueStateError extends Error {
  readonly code = "RELKIT_JOB_QUEUE_STATE_INVALID" as const;

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

/** Rejects times outside the nonnegative safe millisecond range.
 * @param value - Value to validate, normalize or project.
 * @param label - Field label used in validation failures.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
export function assertTime(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new JobQueueStateError(`${label} is invalid`);
}
