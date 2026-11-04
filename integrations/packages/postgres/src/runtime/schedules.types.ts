/** Row and template shapes for persisted schedules and their claimed occurrences. */
import type { JsonValue } from "relkit/contracts";
import type { TimestampValue } from "./jobs-rows.types.js";

/** The task binding a scheduler needs to enqueue a run without the application code. */
export interface ScheduleSubmission {
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId: string;
  readonly scope: string;
  readonly policy?: JsonValue;
}

/** One row of the schedules table. */
export interface ScheduleRow {
  readonly service: string;
  readonly schedule_id: string;
  readonly job_id: string;
  /** Authored definition including reconciliation ownership metadata. */
  readonly definition: JsonValue;
  readonly submission: ScheduleSubmission;
  readonly state: "active" | "paused" | "deleted";
  /** Earliest occurrence not yet claimed. */
  readonly next_at: TimestampValue;
}
