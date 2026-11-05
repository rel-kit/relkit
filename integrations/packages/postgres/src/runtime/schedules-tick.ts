/**
 * Enqueues schedule occurrences exactly once across instances. One pass locks
 * due schedule rows with `FOR UPDATE SKIP LOCKED`, claims each occurrence by
 * inserting into the occurrences table, whose primary key is (service,
 * schedule, occurrence time), enqueues the run in the same transaction, and
 * advances the pending occurrence. A contender that reads a stale pending
 * occurrence loses on the primary key, so it never enqueues a second run.
 */
import { canonicalJson, type JsonValue } from "relkit/contracts";
import { Effect } from "effect";
import * as SqlClient from "effect/sql/SqlClient";
import type { PostgresTables } from "../schema.types.js";
import { backendOperation } from "./database.js";
import { dueOccurrences, type ScheduleTiming } from "./schedule-time.js";
import type { ScheduleRow } from "./schedules.types.js";

type JsonRecord = { readonly [key: string]: JsonValue };

/** One occurrence this pass enqueued (or skipped under `overlap: "skip"`). @experimental */
export interface ClaimedOccurrence {
  readonly scheduleId: string;
  readonly occurrenceAt: string;
  /** The enqueued run, or `skipped` when an earlier run of the schedule was still active. */
  readonly runId: string;
}

/**
 * Builds the identity that ties a run to its occurrence.
 * @param scheduleId - Schedule ID.
 * @param occurrenceAt - Occurrence time, ISO-8601.
 * @returns Stable occurrence identity text.
 * @experimental
 */
export function occurrenceIdentity(scheduleId: string, occurrenceAt: string): string {
  return `${scheduleId}@${occurrenceAt}`;
}

/**
 * Runs one scheduler pass for a jobs service.
 * @param tables - Namespace tables.
 * @param service - Jobs service.
 * @param claimant - Instance identity recorded on claimed occurrences.
 * @returns The occurrences this pass claimed.
 * @experimental
 */
export const tickSchedules = Effect.fn("Postgres.schedules.tick")(function* (
  tables: PostgresTables,
  service: string,
  claimant: string,
) {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const rows = yield* sql<ScheduleRow & { readonly db_now: Date }>`select *, now() as db_now
        from ${sql.literal(tables.schedules)}
        where service = ${service} and state = 'active' and next_at <= now()
        order by next_at for update skip locked limit 20`;
      const claimed: ClaimedOccurrence[] = [];
      for (const row of rows) claimed.push(...(yield* advance(tables, row, claimant)));
      return claimed;
    }),
  );
}, backendOperation("schedules.tick"));

/**
 * Claims the due occurrences of one locked schedule and advances it.
 * @param tables - Namespace tables.
 * @param row - Locked schedule row with the database time.
 * @param claimant - Instance identity.
 * @returns Claimed occurrences.
 */
const advance = Effect.fn("Postgres.schedules.advance")(function* (
  tables: PostgresTables,
  row: ScheduleRow & { readonly db_now: Date },
  claimant: string,
) {
  const sql = yield* SqlClient.SqlClient;
  const timing = row.definition as ScheduleTiming;
  const { due, next } = dueOccurrences(timing, new Date(row.next_at), new Date(row.db_now));
  const claimed: ClaimedOccurrence[] = [];
  for (const occurrence of due) {
    const result = yield* claimOccurrence(tables, row, occurrence.toISOString(), claimant);
    if (result !== undefined) claimed.push(result);
  }
  yield* sql`update ${sql.literal(tables.schedules)} set next_at = ${next.toISOString()}::timestamptz,
      updated_at = now() where service = ${row.service} and schedule_id = ${row.schedule_id}`;
  return claimed;
});

/**
 * Claims one occurrence and enqueues its run; a lost race on the primary key claims nothing.
 * @param tables - Namespace tables.
 * @param row - Schedule row.
 * @param occurrenceAt - Occurrence time, ISO-8601.
 * @param claimant - Instance identity.
 * @returns The claim, or undefined when another instance already claimed it.
 * @experimental
 */
export const claimOccurrence = Effect.fn("Postgres.schedules.claim")(function* (
  tables: PostgresTables,
  row: ScheduleRow,
  occurrenceAt: string,
  claimant: string,
) {
  const sql = yield* SqlClient.SqlClient;
  const runs = sql.literal(tables.jobRuns);
  const definition = row.definition as JsonRecord;
  const active = yield* sql`select 1 from ${runs} where service = ${row.service}
    and status in ('queued', 'running') and request->>'scheduleId' = ${row.schedule_id} limit 1`;
  const runId =
    definition.overlap === "skip" && active.length > 0 ? "skipped" : `run_${randomUUID()}`;
  const inserted = yield* sql`insert into ${sql.literal(tables.scheduleOccurrences)}
      (service, schedule_id, occurrence_at, run_id, claimed_by)
    values (${row.service}, ${row.schedule_id}, ${occurrenceAt}::timestamptz, ${runId}, ${claimant})
    on conflict do nothing returning run_id`;
  if (inserted.length === 0) return undefined;
  if (runId !== "skipped") yield* enqueue(tables, row, definition, occurrenceAt, runId);
  return { scheduleId: row.schedule_id, occurrenceAt, runId } satisfies ClaimedOccurrence;
}, backendOperation("schedules.claim"));

/**
 * Inserts the run for a claimed occurrence with the schedule's static input.
 * @param tables - Namespace tables.
 * @param row - Schedule row with its submission template.
 * @param definition - Authored definition.
 * @param occurrenceAt - Occurrence time, ISO-8601.
 * @param runId - Run ID recorded on the claim.
 */
const enqueue = Effect.fn("Postgres.schedules.enqueue")(function* (
  tables: PostgresTables,
  row: ScheduleRow,
  definition: JsonRecord,
  occurrenceAt: string,
  runId: string,
) {
  const sql = yield* SqlClient.SqlClient;
  const submission = row.submission;
  const identity = occurrenceIdentity(row.schedule_id, occurrenceAt);
  const input =
    definition.input === undefined
      ? { version: 1, kind: "void" }
      : { version: 1, kind: "json", value: definition.input };
  const request = {
    occurrenceIdentity: identity,
    scheduleId: row.schedule_id,
    scheduledFor: occurrenceAt,
    ...(submission.policy === undefined ? {} : { policy: submission.policy }),
  };
  yield* sql`insert into ${sql.literal(tables.jobRuns)} (run_id, service, scope, job_id, task_id,
      task_version, build_id, status, input, request, dedupe_key, operation_id, run_at, accepted_at)
    values (${runId}, ${row.service}, ${submission.scope}, ${submission.jobId}, ${submission.taskId},
      ${submission.taskVersion}, ${submission.buildId}, 'queued', ${JSON.stringify(input)}::jsonb,
      ${JSON.stringify(request)}::jsonb, ${canonicalJson([submission.jobId, null, identity])},
      ${`schedule:${identity}`}, ${occurrenceAt}::timestamptz, now())
    on conflict do nothing`;
});
