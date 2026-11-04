/**
 * Durable submission and retry for the job-runs table. A submission is one
 * INSERT whose dedupe key (job, idempotency key, occurrence) is unique per
 * service and scope, so concurrent duplicates resolve to the first run. A retry
 * copies a terminal run into a new run linked by `retry_of_run_id`; the retry
 * identity is unique per original run, so repeating a retry returns the same
 * new run. Each function is a lazy Effect requiring the SQL client.
 */
import { randomUUID } from "node:crypto";
import { canonicalJson } from "relkit/contracts";
import type { JobUnknownOutcome, RunRetryReceipt } from "relkit/contracts/jobs";
import type {
  NativeReceipt,
  NativeRetryRequest,
  NativeSubmission,
  OperationContext,
} from "relkit/jobs/adapter";
import { Effect } from "effect";
import * as SqlClient from "effect/sql/SqlClient";
import type { PostgresTables } from "../schema.types.js";
import { backendOperation } from "./database.js";
import { handleOf } from "./jobs-rows.js";
import type { JobRunRow, StoredRequest } from "./jobs-rows.types.js";

/**
 * Builds the submission dedupe key; runs without an idempotency key or occurrence never deduplicate.
 * @param request - Validated native submission.
 * @returns Canonical key text, or null.
 */
export function dedupeKey(request: NativeSubmission): string | null {
  if (request.idempotencyKey === undefined && request.occurrenceIdentity === undefined) return null;
  return canonicalJson([
    request.jobId,
    request.idempotencyKey ?? null,
    request.occurrenceIdentity ?? null,
  ]);
}

/**
 * Collects the submission metadata persisted in the `request` column.
 * @param request - Validated native submission.
 * @param context - Operation context supplying the parent run and service generation.
 * @returns JSON-safe metadata with only the fields that were given.
 */
export function storedRequest(request: NativeSubmission, context: OperationContext): StoredRequest {
  const parentRunId = request.parentRunId ?? context.parentRunId;
  const entries = {
    inputHash: request.inputHash,
    inputSchemaHash: request.inputSchemaHash ?? context.inputSchemaHash,
    acceptanceIdentity: request.acceptanceIdentity ?? context.acceptanceIdentity,
    occurrenceIdentity: request.occurrenceIdentity ?? context.occurrenceIdentity,
    idempotencyKey: request.idempotencyKey,
    policy: request.policy,
    scheduledFor: request.scheduledFor,
    tags: request.tags,
    correlationId: request.correlationId ?? context.correlationId,
    parentRunId,
    propagation: request.propagation ?? context.propagation,
    serviceGeneration: context.serviceGeneration,
  };
  return Object.fromEntries(
    Object.entries(entries).filter((entry) => entry[1] !== undefined),
  ) as StoredRequest;
}

/**
 * Inserts a run, or returns the run that already owns its dedupe key.
 * @param tables - Namespace tables.
 * @param request - Validated native submission.
 * @param context - Operation scope and service.
 * @returns The acceptance handle; `duplicate` is set when an earlier run owns the key.
 */
export const submitRun = Effect.fn("Postgres.jobs.submit")(function* (
  tables: PostgresTables,
  request: NativeSubmission,
  context: OperationContext,
) {
  const sql = yield* SqlClient.SqlClient;
  const table = sql.literal(tables.jobRuns);
  const scope = request.scope ?? context.scope;
  const key = dedupeKey(request);
  const input = request.canonicalInput ?? { version: 1, kind: "json", value: request.input };
  const inserted = yield* sql<JobRunRow>`insert into ${table} (run_id, service, scope, job_id,
      task_id, task_version, build_id, status, input, request, dedupe_key, operation_id, run_at,
      accepted_at)
    values (${`run_${randomUUID()}`}, ${context.service}, ${scope}, ${request.jobId},
      ${request.taskId}, ${request.taskVersion}, ${request.buildId}, 'queued',
      ${JSON.stringify(input)}::jsonb, ${JSON.stringify(storedRequest(request, context))}::jsonb,
      ${key}, ${request.operationId}, coalesce(${request.scheduledFor ?? null}::timestamptz, now()),
      now())
    on conflict (service, scope, dedupe_key) where dedupe_key is not null do nothing
    returning *, now() as observed_at`;
  if (inserted[0] !== undefined) return handleOf(inserted[0]);
  const existing = yield* sql<JobRunRow>`select *, now() as observed_at from ${table}
    where service = ${context.service} and scope = ${scope} and dedupe_key = ${key}`;
  if (existing[0] === undefined) return yield* Effect.die(new Error("Deduplicated run vanished"));
  return handleOf(existing[0], true);
}, backendOperation("jobs.submit"));

/**
 * Creates (or returns) the new run for one retry of a terminal run.
 * @param tables - Namespace tables.
 * @param request - Retry request; `retryIdentity` falls back to the operation ID.
 * @param context - Operation service.
 * @returns The retry receipt linking the new run to the original.
 */
export const retryRun = Effect.fn("Postgres.jobs.retry")(function* (
  tables: PostgresTables,
  request: NativeRetryRequest,
  context: OperationContext,
) {
  const sql = yield* SqlClient.SqlClient;
  const table = sql.literal(tables.jobRuns);
  const identity = request.retryIdentity ?? request.operationId;
  const input =
    request.canonicalInput === undefined ? null : JSON.stringify(request.canonicalInput);
  const inserted = yield* sql<JobRunRow>`insert into ${table} (run_id, service, scope, job_id,
      task_id, task_version, build_id, status, input, request, operation_id, retry_of_run_id,
      retry_identity, run_at, accepted_at)
    select ${`run_${randomUUID()}`}, service, scope, job_id, task_id, task_version, build_id,
      'queued', coalesce(${input}::jsonb, input), request - 'scheduledFor' - 'idempotencyKey',
      ${request.operationId}, run_id, ${identity}, now(), now()
    from ${table} where run_id = ${request.runId} and service = ${context.service}
      and status in ('completed', 'failed', 'cancelled')
    on conflict (service, retry_of_run_id, retry_identity) where retry_of_run_id is not null
      do nothing
    returning *, now() as observed_at`;
  const row =
    inserted[0] ??
    (yield* sql<JobRunRow>`select *, now() as observed_at from ${table}
      where service = ${context.service} and retry_of_run_id = ${request.runId}
        and retry_identity = ${identity}`)[0];
  if (row === undefined)
    return yield* Effect.die(new Error("Retry requires an existing terminal run"));
  return { ...handleOf(row), retryOfRunId: request.runId } satisfies RunRetryReceipt;
}, backendOperation("jobs.retry"));

/**
 * Describes a write whose commit may have happened but whose response was lost.
 * @param request - Submission whose outcome is unknown.
 * @returns The unknown outcome; with an idempotency key the caller can resubmit safely.
 */
export function unknownSubmission(request: NativeSubmission): NativeReceipt {
  const outcome: JobUnknownOutcome = {
    code: "RELKIT_JOB_SUBMISSION_UNKNOWN",
    outcome: "unknown",
    operationId: request.operationId,
    ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
    recovery: {
      action: request.idempotencyKey === undefined ? "inspect-native" : "retry-with-same-key",
    },
  };
  return outcome;
}
