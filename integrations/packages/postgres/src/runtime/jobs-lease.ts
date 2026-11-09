/**
 * Lease protocol for job runs. A worker claims the oldest due run with
 * `FOR UPDATE SKIP LOCKED`, so concurrent workers never claim the same row; a
 * claim stamps an owner token and an expiry that heartbeats extend. Every
 * settlement is fenced on the owner token, so a worker whose lease expired and
 * was re-claimed cannot overwrite the new attempt. Expired leases are claimable
 * again while attempts remain; exhausted ones end failed and dead-lettered.
 */
import type { JsonValue } from "relkit/contracts";
import { Effect } from "effect";
import * as SqlClient from "effect/sql/SqlClient";
import type { PostgresTables } from "../schema.types.js";
import { backendOperation } from "./database.js";
import type { JobRunRow } from "./jobs-rows.types.js";
import { failureOf, retryDelay } from "./jobs-retry-policy.js";

const MAX_ATTEMPTS = "coalesce((request->'policy'->'retry'->>'maxAttempts')::integer, 1)";
const LEASE_EXPIRED = JSON.stringify({
  code: "RELKIT_JOB_LEASE_EXPIRED",
  message: "The worker lease expired after the last permitted attempt",
});

/** Result of extending a lease. */
export type HeartbeatOutcome = "held" | "cancel-requested" | "lost";

/**
 * Ends expired runs that have no attempts left, then claims the next due run.
 * @param tables - Namespace tables.
 * @param service - Jobs service whose runs are eligible.
 * @param owner - Owner token fencing later settlement.
 * @param leaseMs - Lease duration.
 * @returns The claimed row, or undefined when nothing is due.
 */
export const leaseRun = Effect.fn("Postgres.jobs.lease")(function* (
  tables: PostgresTables,
  service: string,
  owner: string,
  leaseMs: number,
) {
  const sql = yield* SqlClient.SqlClient;
  const table = sql.literal(tables.jobRuns);
  const max = sql.literal(MAX_ATTEMPTS);
  yield* sql`update ${table} set completed_at = now(), lease_owner = null, updated_at = now(),
      status = case when cancellation is null then 'failed' else 'cancelled' end,
      dead_lettered = cancellation is null, error = ${LEASE_EXPIRED}::jsonb
    where service = ${service} and status = 'running' and lease_expires_at < now()
      and (cancellation is not null or attempt >= ${max})`;
  const rows = yield* sql<JobRunRow>`with candidate as (
      select run_id from ${table}
      where service = ${service} and ((status = 'queued' and run_at <= now())
        or (status = 'running' and lease_expires_at < now()))
      order by run_at, accepted_at for update skip locked limit 1)
    update ${table} as run set status = 'running', attempt = run.attempt + 1,
      lease_owner = ${owner}, lease_expires_at = now() + ${leaseMs} * interval '1 millisecond',
      started_at = now(), updated_at = now()
    from candidate where run.run_id = candidate.run_id
    returning run.*, now() as observed_at`;
  return rows[0];
}, backendOperation("jobs.lease"));

/**
 * Extends a held lease and reports a pending cancellation.
 * @param tables - Namespace tables.
 * @param runId - Leased run.
 * @param owner - Owner token from the claim.
 * @param leaseMs - New lease duration from now.
 * @returns Whether the lease is still held and whether cancellation was requested.
 */
export const heartbeatRun = Effect.fn("Postgres.jobs.heartbeat")(function* (
  tables: PostgresTables,
  runId: string,
  owner: string,
  leaseMs: number,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly cancelled: boolean }>`update ${sql.literal(tables.jobRuns)}
    set lease_expires_at = now() + ${leaseMs} * interval '1 millisecond'
    where run_id = ${runId} and lease_owner = ${owner} and status = 'running'
    returning cancellation is not null as cancelled`;
  const row = rows[0];
  const outcome: HeartbeatOutcome =
    row === undefined ? "lost" : row.cancelled ? "cancel-requested" : "held";
  return outcome;
}, backendOperation("jobs.heartbeat"));

/**
 * Records success for a held lease; a run with a pending cancellation ends cancelled.
 * @param tables - Namespace tables.
 * @param runId - Leased run.
 * @param owner - Owner token from the claim.
 * @param output - JSON output, or undefined for void tasks.
 * @returns True when this owner settled the run; false when its lease was lost.
 */
export const completeRun = Effect.fn("Postgres.jobs.complete")(function* (
  tables: PostgresTables,
  runId: string,
  owner: string,
  output: JsonValue | undefined,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`update ${sql.literal(tables.jobRuns)} set
      status = case when cancellation is null then 'completed' else 'cancelled' end,
      output = case when cancellation is null then ${JSON.stringify(output ?? null)}::jsonb end,
      error = null, completed_at = now(), lease_owner = null, lease_expires_at = null,
      updated_at = now()
    where run_id = ${runId} and lease_owner = ${owner} and status = 'running'
    returning run_id`;
  return rows.length === 1;
}, backendOperation("jobs.complete"));

/**
 * Records a failed attempt: schedules the next attempt per policy, or ends the
 * run failed and dead-lettered when the budget is spent or the failure forbids retry.
 * @param tables - Namespace tables.
 * @param runId - Leased run.
 * @param owner - Owner token from the claim; undefined settles a run no live lease holds.
 * @param error - Value the task threw.
 * @returns True when this owner settled the run; false when its lease was lost.
 */
export const failRun = Effect.fn("Postgres.jobs.fail")(function* (
  tables: PostgresTables,
  runId: string,
  owner: string | undefined,
  error: Error | JsonValue | object | undefined,
) {
  const sql = yield* SqlClient.SqlClient;
  const table = sql.literal(tables.jobRuns);
  const fence = (value: string | undefined) =>
    value === undefined
      ? sql`status in ('queued', 'running') and (lease_owner is null or lease_expires_at < now())`
      : sql`lease_owner = ${value} and status = 'running'`;
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const rows = yield* sql<JobRunRow>`select *, now() as observed_at from ${table}
        where run_id = ${runId} and ${fence(owner)} for update`;
      const row = rows[0];
      if (row === undefined) return false;
      const failure = failureOf(error);
      const delay =
        row.cancellation === null
          ? retryDelay(row.request.policy, Math.max(row.attempt, 1), failure)
          : undefined;
      const text = JSON.stringify(failure);
      if (delay !== undefined)
        yield* sql`update ${table} set status = 'queued', error = ${text}::jsonb,
            run_at = now() + ${delay} * interval '1 millisecond', lease_owner = null,
            lease_expires_at = null, updated_at = now() where run_id = ${runId}`;
      else
        yield* sql`update ${table} set error = ${text}::jsonb, completed_at = now(),
            status = case when cancellation is null then 'failed' else 'cancelled' end,
            dead_lettered = cancellation is null, lease_owner = null, lease_expires_at = null,
            updated_at = now() where run_id = ${runId}`;
      return true;
    }),
  );
}, backendOperation("jobs.fail"));
