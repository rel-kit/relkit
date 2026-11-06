/** Row shapes read from the job-runs table and the submission metadata persisted with each run. */
import type { JsonValue, TracePropagation } from "relkit/contracts";
import type {
  JobErrorEnvelope,
  JobWireEnvelope,
  RunCancellationReceipt,
} from "relkit/contracts/jobs";

/** A timestamp column as the driver returns it. */
export type TimestampValue = Date | string;

/** Submission metadata kept in the `request` jsonb column; every field is optional. */
export interface StoredRequest {
  readonly inputHash?: string;
  readonly inputSchemaHash?: string;
  readonly acceptanceIdentity?: string;
  readonly occurrenceIdentity?: string;
  readonly idempotencyKey?: string;
  readonly policy?: JsonValue;
  readonly scheduledFor?: string;
  readonly scheduleId?: string;
  readonly tags?: readonly string[];
  readonly correlationId?: string;
  readonly parentRunId?: string;
  readonly propagation?: TracePropagation;
  readonly serviceGeneration?: string;
}

/** One row of the job-runs table. */
export interface JobRunRow {
  readonly run_id: string;
  readonly service: string;
  readonly scope: string;
  readonly job_id: string;
  readonly task_id: string;
  readonly task_version: string;
  readonly build_id: string;
  /** Stored state: queued, running, completed, failed or cancelled. */
  readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
  /** Attempts started so far; a leased run's current attempt. */
  readonly attempt: number;
  readonly input: JobWireEnvelope;
  readonly request: StoredRequest;
  readonly dedupe_key: string | null;
  readonly operation_id: string;
  readonly retry_of_run_id: string | null;
  readonly run_at: TimestampValue;
  readonly accepted_at: TimestampValue;
  readonly started_at: TimestampValue | null;
  readonly completed_at: TimestampValue | null;
  readonly lease_owner: string | null;
  readonly lease_expires_at: TimestampValue | null;
  readonly output: JsonValue | null;
  readonly error: JobErrorEnvelope | null;
  readonly cancellation: RunCancellationReceipt | null;
  readonly dead_lettered: boolean;
  /** Database time when the row was read, used for derived states such as `delayed`. */
  readonly observed_at: TimestampValue;
}
