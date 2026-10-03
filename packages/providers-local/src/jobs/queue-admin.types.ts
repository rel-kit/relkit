import type {
  JobFailureMetadata,
  JobQueueAdminRetryOptions,
  JobQueueEntry,
} from "./queue-utils.js";

/** Administrative transitions sharing the queue serialization owner. */
export interface JobQueueAdminMutations {
  readonly adminRetry: (
    instanceId: string,
    options?: JobQueueAdminRetryOptions,
  ) => Promise<JobQueueEntry>;
  readonly adminDeadLetter: (
    instanceId: string,
    failure: JobFailureMetadata,
  ) => Promise<JobQueueEntry>;
}
