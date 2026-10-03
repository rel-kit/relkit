import type { JobFailureMetadata, JobQueueEntry } from "./materialize-jobs-types.js";

/** Durable retry decision and the queue entry after acknowledgement. */
export interface JobFailureTransition {
  readonly entry: JobQueueEntry;
  readonly classification: "retryable" | "non-retryable";
  readonly failure: JobFailureMetadata;
}
