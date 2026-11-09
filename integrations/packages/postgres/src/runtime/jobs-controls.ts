/**
 * Reads, lists and cancels job runs. Cancellation runs in a transaction that
 * locks the row, so the first terminal transition wins: a queued run becomes
 * cancelled at once, a running run records the request and its worker observes
 * it on the next lease heartbeat, and later requests on a terminal run report
 * `already-terminal`. Each function is a lazy Effect requiring the SQL client.
 */
import type { RunCancellationReceipt, RunPage, RunSnapshot } from "relkit/contracts/jobs";
import type { NativeCancelRequest, NativeRunQuery, OperationContext } from "relkit/jobs/adapter";
import { Data, Effect } from "effect";
import * as SqlClient from "effect/sql/SqlClient";
import type { PostgresTables } from "../schema.types.js";
import { backendOperation } from "./database.js";
import { isTerminal, iso, snapshotOf, statusOf } from "./jobs-rows.js";
import type { JobRunRow } from "./jobs-rows.types.js";

/** No run with this ID exists in the operation's service. @experimental */
export class PostgresRunNotFoundError extends Data.TaggedError("PostgresRunNotFoundError")<{
  /** Run ID that was requested. */
  readonly runId: string;
  /** Summary safe to log. */
  readonly message: string;
}> {}

/**
 * Reads one run in the operation's service.
 * @param tables - Namespace tables.
 * @param runId - Run identity.
 * @param context - Operation service.
 * @returns The run snapshot, or PostgresRunNotFoundError.
 * @experimental
 */
export const getRun = Effect.fn("Postgres.jobs.get")(function* (
  tables: PostgresTables,
  runId: string,
  context: OperationContext,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<JobRunRow>`select *, now() as observed_at
    from ${sql.literal(tables.jobRuns)} where run_id = ${runId} and service = ${context.service}`;
  if (rows[0] === undefined)
    return yield* new PostgresRunNotFoundError({ runId, message: "Postgres run was not found" });
  return snapshotOf(rows[0]);
}, backendOperation("jobs.get"));

/**
 * Lists runs newest first with keyset pagination.
 * @param tables - Namespace tables.
 * @param query - Filters, limit (1–200, default 50) and an opaque cursor.
 * @param context - Operation service.
 * @returns One page of snapshots.
 * @experimental
 */
export const listRuns = Effect.fn("Postgres.jobs.list")(function* (
  tables: PostgresTables,
  query: NativeRunQuery,
  context: OperationContext,
) {
  const sql = yield* SqlClient.SqlClient;
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const clauses = [sql`service = ${context.service}`];
  const text = [
    ["job_id", query.jobId],
    ["task_id", query.taskId],
    ["task_version", query.taskVersion],
    ["build_id", query.buildId],
    ["run_id", query.runId],
  ] as const;
  for (const [column, value] of text)
    if (value !== undefined) clauses.push(sql`${sql.literal(column)} = ${value}`);
  if (query.parentRunId !== undefined)
    clauses.push(sql`request->>'parentRunId' = ${query.parentRunId}`);
  if (query.correlationId !== undefined)
    clauses.push(sql`request->>'correlationId' = ${query.correlationId}`);
  if (query.acceptedFrom !== undefined)
    clauses.push(sql`accepted_at >= ${query.acceptedFrom}::timestamptz`);
  if (query.acceptedTo !== undefined)
    clauses.push(sql`accepted_at <= ${query.acceptedTo}::timestamptz`);
  const cursor = decodeCursor(query.cursor);
  if (cursor !== undefined)
    clauses.push(sql`(accepted_at, run_id) < (${cursor.at}::timestamptz, ${cursor.runId})`);
  const rows = yield* sql<JobRunRow>`select *, now() as observed_at
    from ${sql.literal(tables.jobRuns)} where ${sql.and(clauses)}
    order by accepted_at desc, run_id desc limit ${limit + 1}`;
  return page(rows, limit, query, context.service);
}, backendOperation("jobs.list"));

/**
 * Applies the first cancellation transition under a row lock.
 * @param tables - Namespace tables.
 * @param request - Cancel request with its operation identity.
 * @param context - Operation service.
 * @returns `requested` for a live run (or a repeated request), else `already-terminal`.
 * @experimental
 */
export const cancelRun = Effect.fn("Postgres.jobs.cancel")(function* (
  tables: PostgresTables,
  request: NativeCancelRequest,
  context: OperationContext,
) {
  const sql = yield* SqlClient.SqlClient;
  const table = sql.literal(tables.jobRuns);
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const rows = yield* sql<JobRunRow>`select *, now() as observed_at from ${table}
        where run_id = ${request.runId} and service = ${context.service} for update`;
      const row = rows[0];
      if (row === undefined)
        return yield* new PostgresRunNotFoundError({
          runId: request.runId,
          message: "Postgres run was not found",
        });
      if (row.cancellation?.operationId === request.operationId) return row.cancellation;
      if (isTerminal(row.status))
        return {
          runId: row.run_id,
          operationId: request.operationId,
          outcome: "already-terminal",
          run: snapshotOf(row),
        } satisfies RunCancellationReceipt;
      if (row.cancellation !== null) return row.cancellation;
      const receipt: RunCancellationReceipt = {
        runId: row.run_id,
        operationId: request.operationId,
        outcome: "requested",
        requestedAt: iso(row.observed_at),
      };
      yield* sql`update ${table} set cancellation = ${JSON.stringify(receipt)}::jsonb,
          status = case when status = 'queued' then 'cancelled' else status end,
          completed_at = case when status = 'queued' then now() else completed_at end,
          updated_at = now()
        where run_id = ${row.run_id}`;
      return receipt;
    }),
  );
}, backendOperation("jobs.cancel"));

/**
 * Builds a run page, applying derived-status filters after the SQL page.
 * @param rows - Up to `limit + 1` rows, newest first.
 * @param limit - Page size.
 * @param query - Query with optional status filter.
 * @param service - Service reported as available.
 * @returns The page with a cursor when more rows exist.
 */
function page(
  rows: readonly JobRunRow[],
  limit: number,
  query: NativeRunQuery,
  service: string,
): RunPage<RunSnapshot> {
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  const items = pageRows
    .filter((row) => query.status === undefined || query.status.includes(statusOf(row)))
    .map(snapshotOf);
  return {
    items,
    hasMore: rows.length > limit,
    ...(rows.length > limit && last !== undefined
      ? { nextCursor: encodeCursor(iso(last.accepted_at), last.run_id) }
      : {}),
    availability: [{ service, state: "available" }],
  };
}

/**
 * Encodes a keyset position.
 * @param at - Acceptance time of the last row.
 * @param runId - Run ID of the last row.
 * @returns Opaque base64url cursor text.
 */
function encodeCursor(at: string, runId: string): string {
  return Buffer.from(JSON.stringify([at, runId])).toString("base64url");
}

/**
 * Decodes a cursor produced by `encodeCursor`; malformed cursors restart the listing.
 * @param cursor - Opaque cursor text.
 * @returns The keyset position, or undefined.
 */
function decodeCursor(cursor: string | undefined): { at: string; runId: string } | undefined {
  if (cursor === undefined) return undefined;
  try {
    const [at, runId] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return typeof at === "string" && typeof runId === "string" ? { at, runId } : undefined;
  } catch {
    return undefined;
  }
}
