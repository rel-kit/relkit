import type { JsonValue } from "./json.js";

export type JobClientOperation =
  "trigger" | "get" | "list" | "watch" | "cancel" | "retry" | "stream";

export interface JobAccessRequest {
  readonly operation: JobClientOperation;
  readonly jobId: string;
  readonly runId?: string;
  readonly stream?: string;
  readonly input?: JsonValue;
}

export interface JobAccessGrant {
  readonly scope: string;
  readonly expiresAt?: string;
}

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
