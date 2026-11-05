/**
 * Persisted schedule definitions behind the native schedule operations that
 * schedule reconciliation and the admin API call. Each row keeps the authored
 * definition (with its ownership metadata), the submission template the
 * scheduler uses to enqueue runs, and the next pending occurrence. Upserting a
 * definition with unchanged timing keeps its pending occurrence, so restarts
 * and redeploys neither skip nor repeat one.
 */
import type { JsonValue } from "relkit/contracts";
import type { NativeScheduleOperations, OperationContext } from "relkit/jobs/adapter";
import { Effect } from "effect";
import * as SqlClient from "effect/sql/SqlClient";
import type { PostgresTables } from "../schema.types.js";
import type { PostgresDatabase } from "./database.types.js";
import { backendOperation } from "./database.js";
import { iso } from "./jobs-rows.js";
import { nextOccurrence, type ScheduleTiming } from "./schedule-time.js";
import type { ScheduleRow, ScheduleSubmission } from "./schedules.types.js";

type JsonRecord = { readonly [key: string]: JsonValue };

/**
 * Builds the native schedule operations for one jobs service.
 * @param database - Connection owner.
 * @param service - Jobs service the schedules belong to.
 * @param template - Looks up the task binding (version, build, policy) for a job.
 * @returns Promise operations used by reconciliation and the admin API.
 */
export function createScheduleOperations(
  database: PostgresDatabase,
  service: string,
  template: (jobId: string) => Omit<ScheduleSubmission, "scope"> | undefined,
): NativeScheduleOperations {
  const tables = database.tables;
  const write = (scheduleId: string, context: OperationContext, outcome: string) => ({
    operationId: context.operationId ?? `schedule:${scheduleId}`,
    scheduleId,
    outcome,
  });
  const operations: NativeScheduleOperations = {
    list: (query, context) =>
      database.run(
        listSchedules(tables, service, typeof query.jobId === "string" ? query.jobId : null),
        context.signal,
      ),
    get: async (id, context) => {
      const rows = await database.run(selectSchedule(tables, service, id), context.signal);
      return rows[0] === undefined
        ? { outcome: "unavailable" }
        : { outcome: "available", schedule: record(rows[0]) };
    },
    upsert: async (definition, context) => {
      const value = scheduleDefinition(definition);
      const metadata = value.metadata as JsonRecord | undefined;
      const jobId = typeof metadata?.jobId === "string" ? metadata.jobId : "";
      const known = template(jobId);
      if (known === undefined) throw new Error(`No Postgres task binding for job ${jobId}`);
      const scope = typeof metadata?.scope === "string" ? metadata.scope : context.scope;
      const submission: ScheduleSubmission = { ...known, scope };
      const created = await database.run(
        upsertSchedule(tables, service, value, submission),
        context.signal,
      );
      return write(String(value.id), context, created ? "created" : "updated");
    },
    pause: async (id, context) => {
      await database.run(setState(tables, service, id, "paused"), context.signal);
      return write(id, context, "paused");
    },
    resume: async (id, context) => {
      await database.run(setState(tables, service, id, "active"), context.signal);
      return write(id, context, "resumed");
    },
    delete: async (id, context) => {
      await database.run(setState(tables, service, id, "deleted"), context.signal);
      return write(id, context, "deleted");
    },
  };
  return Object.freeze(operations);
}

/**
 * Narrows a stored or authored definition to a record with an ID.
 * @param definition - Definition JSON.
 * @returns The record.
 * @throws TypeError when it is not an object with a string `id`.
 */
function scheduleDefinition(definition: JsonValue): JsonRecord {
  if (definition === null || typeof definition !== "object" || Array.isArray(definition))
    throw new TypeError("Schedule definition must be an object");
  const record = definition as JsonRecord;
  if (typeof record.id !== "string" || record.id === "")
    throw new TypeError("Schedule definition needs an id");
  return record;
}

/**
 * Projects a row to the schedule record shape reconciliation reads.
 * @param row - Schedule row.
 * @returns The record with state, definition and ownership metadata.
 */
function record(row: ScheduleRow) {
  const definition = row.definition as JsonRecord;
  return {
    id: row.schedule_id,
    jobId: row.job_id,
    state: row.state === "paused" ? "paused" : "active",
    definition,
    ...(definition.metadata === undefined ? {} : { metadata: definition.metadata }),
    nextOccurrenceAt: iso(row.next_at),
  };
}

const selectSchedule = Effect.fn("Postgres.schedules.get")(function* (
  tables: PostgresTables,
  service: string,
  id: string,
) {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql<ScheduleRow>`select * from ${sql.literal(tables.schedules)}
    where service = ${service} and schedule_id = ${id} and state <> 'deleted'`;
}, backendOperation("schedules.get"));

const listSchedules = Effect.fn("Postgres.schedules.list")(function* (
  tables: PostgresTables,
  service: string,
  jobId: string | null,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<ScheduleRow>`select * from ${sql.literal(tables.schedules)}
    where service = ${service} and state <> 'deleted'
      and (${jobId}::text is null or job_id = ${jobId})
    order by schedule_id`;
  return { outcome: "available", schedules: rows.map(record) };
}, backendOperation("schedules.list"));

/**
 * Inserts or updates a definition, keeping the pending occurrence when timing is unchanged.
 * @returns True when the schedule was created.
 */
const upsertSchedule = Effect.fn("Postgres.schedules.upsert")(function* (
  tables: PostgresTables,
  service: string,
  definition: JsonRecord,
  submission: ScheduleSubmission,
) {
  const sql = yield* SqlClient.SqlClient;
  const timing = definition as ScheduleTiming;
  const [now] = yield* sql<{ readonly now: Date }>`select now() as now`;
  const nextAt = nextOccurrence(timing, now?.now ?? new Date()).toISOString();
  const rows = yield* sql<{
    readonly created: boolean;
  }>`insert into ${sql.literal(tables.schedules)}
      as current (service, schedule_id, job_id, definition, submission, state, next_at)
    values (${service}, ${String(definition.id)}, ${submission.jobId},
      ${JSON.stringify(definition)}::jsonb, ${JSON.stringify(submission)}::jsonb, 'active',
      ${nextAt}::timestamptz)
    on conflict (service, schedule_id) do update set job_id = excluded.job_id,
      definition = excluded.definition, submission = excluded.submission,
      state = case when current.state = 'deleted' then 'active' else current.state end,
      next_at = case when current.state <> 'deleted'
        and current.definition->'cron' is not distinct from excluded.definition->'cron'
        and current.definition->'timezone' is not distinct from excluded.definition->'timezone'
        and current.definition->'every' is not distinct from excluded.definition->'every'
        then current.next_at else excluded.next_at end, updated_at = now()
    returning (xmax = 0) as created`;
  return rows[0]?.created === true;
}, backendOperation("schedules.upsert"));

const setState = Effect.fn("Postgres.schedules.setState")(function* (
  tables: PostgresTables,
  service: string,
  id: string,
  state: "active" | "paused" | "deleted",
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`update ${sql.literal(tables.schedules)} set state = ${state}, updated_at = now()
    where service = ${service} and schedule_id = ${id}`;
}, backendOperation("schedules.setState"));
