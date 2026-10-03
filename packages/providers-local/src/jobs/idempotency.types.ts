import type { JobIdempotencyRecord, JobQueueAcceptance } from "./queue-utils.js";

/** Resolved prior acceptance or new deduplication metadata for enqueue. */
export interface IdempotencyPreparation {
  readonly record?: JobIdempotencyRecord;
  readonly duplicate?: JobQueueAcceptance;
}
