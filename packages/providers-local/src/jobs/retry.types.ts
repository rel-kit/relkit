import type { JobFailureMetadata } from "./queue-utils.js";

/** Whether the normalized failure permits another attempt. */
export type RetryClassification = "retryable" | "non-retryable";

/** Durable queue outcome selected by retry policy. */
export type RetryState = "delayed" | "dead-lettered";

/** Replaceable source of values in [0, 1) for deterministic jitter. */
export type RandomSource = () => number;

/** Validated retry classification, delay and safe failure metadata. */
export interface RetryPlan {
  readonly classification: RetryClassification;
  readonly state: RetryState;
  readonly attempt: number;
  readonly delayMs: number;
  readonly failure: JobFailureMetadata;
}

/** Clock, jitter and transition options for applying retry policy. */
export interface RetryOptions {
  readonly now?: () => number;
  readonly random?: RandomSource;
}
