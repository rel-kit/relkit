/**
 * Maps job-run rows to the public jobs contract. The table stores five states;
 * `delayed` and `retrying` are derived from the eligibility time and attempt
 * count at read time, and dead-lettered failures carry a diagnostic code. Pure
 * functions only: callers own the SQL that produced the rows.
 */
import type { RunHandle, RunSnapshot } from "relkit/contracts/jobs";
import type { JobRunRow, TimestampValue } from "./jobs-rows.types.js";
export type { JobRunRow, StoredRequest, TimestampValue } from "./jobs-rows.types.js";

/** Diagnostic code reported on failed runs that reached the dead-letter state. */
export const DEAD_LETTER_CODE = "RELKIT_JOB_DEAD_LETTERED";

/**
 * Normalizes a driver timestamp to ISO-8601 text.
 * @param value - Date or timestamp text from the driver.
 * @returns ISO-8601 UTC text.
 */
export function iso(value: TimestampValue): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/**
 * Builds the acceptance handle returned by submission and retry.
 * @param row - Accepted run row.
 * @param duplicate - Whether an earlier submission with the same key owns the run.
 * @returns The run handle.
 */
export function handleOf(row: JobRunRow, duplicate = false): RunHandle {
  return Object.freeze({
    accepted: true as const,
    runId: row.run_id,
    jobId: row.job_id,
    taskId: row.task_id,
    taskVersion: row.task_version,
    acceptedAt: iso(row.accepted_at),
    ...(duplicate ? { duplicate: true } : {}),
  });
}

/**
 * Derives the public run status from the stored state and eligibility time.
 * @param row - Run row read with the database time.
 * @returns The normalized public status.
 */
export function statusOf(row: JobRunRow): RunSnapshot["status"] {
  if (row.status !== "queued") return row.status;
  if (Date.parse(iso(row.run_at)) > Date.parse(iso(row.observed_at)))
    return row.attempt > 0 ? "retrying" : "delayed";
  return row.attempt > 0 ? "retrying" : "queued";
}

/**
 * Projects one row to the public run snapshot.
 * @param row - Run row read with the database time.
 * @returns A frozen snapshot; completed runs expose their output.
 */
export function snapshotOf(row: JobRunRow): RunSnapshot {
  const status = statusOf(row);
  const base = {
    ...handleOf(row),
    buildId: row.build_id,
    service: row.service,
    scope: row.scope,
    status,
    observedAt: iso(row.observed_at),
    attempt: row.attempt,
    ...optional(row),
  };
  if (status === "completed")
    return Object.freeze({
      ...base,
      status,
      resultAvailability: "available" as const,
      output: row.output,
    });
  return Object.freeze({
    ...base,
    status,
    resultAvailability: status === "failed" || status === "cancelled" ? "unavailable" : "pending",
  }) as RunSnapshot;
}

/**
 * Collects the optional snapshot fields present on the row.
 * @param row - Run row.
 * @returns Only the fields that have values.
 */
function optional(row: JobRunRow) {
  const request = row.request;
  return {
    ...(request.inputHash === undefined ? {} : { inputHash: request.inputHash }),
    ...(request.inputSchemaHash === undefined ? {} : { inputSchemaHash: request.inputSchemaHash }),
    ...(request.acceptanceIdentity === undefined
      ? {}
      : { acceptanceIdentity: request.acceptanceIdentity }),
    ...(row.started_at === null ? {} : { startedAt: iso(row.started_at) }),
    ...(row.completed_at === null ? {} : { completedAt: iso(row.completed_at) }),
    ...(row.status === "queued" ? { nextEligibleAt: iso(row.run_at) } : {}),
    ...(request.parentRunId === undefined ? {} : { parentRunId: request.parentRunId }),
    ...(row.retry_of_run_id === null ? {} : { retryOfRunId: row.retry_of_run_id }),
    ...(request.scheduledFor === undefined ? {} : { scheduledFor: request.scheduledFor }),
    ...(row.cancellation === null ? {} : { cancellation: row.cancellation }),
    ...(row.dead_lettered ? { nativeDiagnosticCode: DEAD_LETTER_CODE } : {}),
    ...(row.error === null ? {} : { error: row.error }),
    input: row.input,
  };
}

/**
 * Reports whether a stored state can still change.
 * @param status - Stored run state.
 * @returns True for completed, failed and cancelled runs.
 */
export function isTerminal(status: JobRunRow["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}
