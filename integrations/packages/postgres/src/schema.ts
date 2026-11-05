/**
 * Owns the Postgres backend's table layout: identifier validation, quoted table
 * names, and the idempotent DDL that the runtime applies at startup under an
 * advisory lock. Applications that own their migrations can apply the same
 * statements from `postgresBackendSql`. Nothing here opens a connection.
 */
import type { PostgresTableOptions, PostgresTables } from "./schema.types.js";
export type { PostgresTableOptions, PostgresTables } from "./schema.types.js";

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,40}$/u;

/**
 * Resolves quoted table names for one backend namespace.
 * @param options - Schema and table prefix; both must be lowercase SQL identifiers.
 * @returns Frozen, quoted, schema-qualified table names.
 * @throws TypeError when a name is not a lowercase identifier of at most 41 characters.
 * @example postgresTables({ tablePrefix: "app" }).jobRuns === '"public"."app_job_runs"';
 * @experimental
 */
export function postgresTables(options: PostgresTableOptions = {}): PostgresTables {
  const schema = identifier(options.schema ?? "public", "schema");
  const prefix = identifier(options.tablePrefix ?? "relkit", "tablePrefix");
  const table = (name: string) => `"${schema}"."${prefix}_${name}"`;
  return Object.freeze({
    schema: `"${schema}"`,
    jobRuns: table("job_runs"),
    schedules: table("schedules"),
    scheduleOccurrences: table("schedule_occurrences"),
    eventOutbox: table("event_outbox"),
    eventConsumers: table("event_consumers"),
    eventDeliveries: table("event_deliveries"),
    lockKey: lockKey(`${schema}.${prefix}`),
  });
}

/**
 * Lists the idempotent DDL statements for one backend namespace, in apply order.
 * @param options - Schema and table prefix.
 * @returns `create ... if not exists` statements; applying them twice is a no-op.
 * @example postgresBackendSql().length > 0;
 * @experimental
 */
export function postgresBackendSql(options: PostgresTableOptions = {}): readonly string[] {
  const t = postgresTables(options);
  const index = (name: string) => `"${(options.tablePrefix ?? "relkit") + "_" + name}"`;
  return Object.freeze([
    `create schema if not exists ${t.schema}`,
    `create table if not exists ${t.jobRuns} (
      run_id text primary key, service text not null, scope text not null,
      job_id text not null, task_id text not null, task_version text not null, build_id text not null,
      status text not null, attempt integer not null default 0, input jsonb not null, request jsonb not null,
      dedupe_key text, operation_id text not null, retry_of_run_id text, retry_identity text,
      run_at timestamptz not null, accepted_at timestamptz not null, started_at timestamptz,
      completed_at timestamptz, lease_owner text, lease_expires_at timestamptz, output jsonb,
      error jsonb, cancellation jsonb, dead_lettered boolean not null default false,
      updated_at timestamptz not null default now())`,
    `create unique index if not exists ${index("job_runs_dedupe")} on ${t.jobRuns} (service, scope, dedupe_key) where dedupe_key is not null`,
    `create unique index if not exists ${index("job_runs_retry")} on ${t.jobRuns} (service, retry_of_run_id, retry_identity) where retry_of_run_id is not null`,
    `create index if not exists ${index("job_runs_ready")} on ${t.jobRuns} (service, status, run_at)`,
    `create table if not exists ${t.schedules} (
      service text not null, schedule_id text not null, job_id text not null, definition jsonb not null,
      submission jsonb not null, state text not null default 'active', next_at timestamptz not null,
      updated_at timestamptz not null default now(), primary key (service, schedule_id))`,
    `create table if not exists ${t.scheduleOccurrences} (
      service text not null, schedule_id text not null, occurrence_at timestamptz not null,
      run_id text not null, claimed_by text not null, claimed_at timestamptz not null default now(),
      primary key (service, schedule_id, occurrence_at))`,
    `create table if not exists ${t.eventOutbox} (
      instance_id text primary key, profile text not null, event_id text not null, version integer not null,
      envelope jsonb not null, published_at timestamptz not null default now())`,
    `create table if not exists ${t.eventConsumers} (
      profile text not null, trigger_id text not null, event_id text not null, version integer not null,
      registered_at timestamptz not null default now(), primary key (profile, trigger_id))`,
    `create table if not exists ${t.eventDeliveries} (
      instance_id text not null references ${t.eventOutbox} (instance_id) on delete cascade,
      profile text not null, trigger_id text not null, status text not null default 'available',
      attempt integer not null default 0, run_at timestamptz not null default now(),
      lease_owner text, lease_expires_at timestamptz, error jsonb, completed_at timestamptz,
      primary key (instance_id, trigger_id))`,
    `create index if not exists ${index("event_deliveries_ready")} on ${t.eventDeliveries} (profile, trigger_id, status, run_at)`,
  ]);
}

/**
 * Validates one lowercase SQL identifier before it is quoted into DDL.
 * @param value - Candidate identifier.
 * @param name - Option name used in the error message.
 * @returns The unchanged identifier.
 */
function identifier(value: string, name: string): string {
  if (!IDENTIFIER.test(value))
    throw new TypeError(`Postgres ${name} must be a lowercase SQL identifier`);
  return value;
}

/**
 * Derives a stable 31-bit advisory-lock key from the namespace so separate
 * namespaces never serialize each other's schema creation.
 * @param namespace - `schema.prefix` text.
 * @returns A positive 32-bit integer.
 */
function lockKey(namespace: string): number {
  let hash = 0x811c9dc5;
  for (const character of namespace) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash & 0x7fffffff;
}
