import type { JsonValue } from "./json.js";

/** Client action requiring a job access grant. */
export type JobClientOperation =
  "trigger" | "get" | "list" | "watch" | "cancel" | "retry" | "stream";

/** Resource and optional input presented for job authorization. */
export interface JobAccessRequest {
  readonly operation: JobClientOperation;
  readonly jobId: string;
  readonly runId?: string;
  readonly stream?: string;
  readonly input?: JsonValue;
}

/** Scope and optional expiry returned by the access provider. */
export interface JobAccessGrant {
  readonly scope: string;
  readonly expiresAt?: string;
}

/** Recoverable uncertainty after a job submission or control request. */
export interface JobUnknownOutcome {
  readonly code: "RELKIT_JOB_SUBMISSION_UNKNOWN" | "RELKIT_JOB_CONTROL_UNKNOWN";
  readonly outcome: "unknown";
  readonly operationId: string;
  readonly idempotencyKey?: string;
  readonly recovery: {
    readonly action: "retry-with-same-key" | "inspect-native" | "unavailable";
    readonly expiresAt?: string;
  };
}
