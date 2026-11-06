/** Authoring contracts for the Postgres jobs and events providers selected in `defineApp`. */
import type { JobsServiceOptions } from "relkit/jobs";
import type { BindingValueRef } from "relkit/provider";
import type { PostgresTableOptions } from "./schema.types.js";

/** A connection string given inline or as an environment binding. @experimental */
export type PostgresUrlInput =
  | string
  | BindingValueRef<string, string, "string">
  | BindingValueRef<string, string, "secret-string">;

/** Connection and table settings shared by the jobs and events providers. @experimental */
export interface PostgresConnectionOptions extends PostgresTableOptions {
  /** Postgres connection string; at runtime `RELKIT_POSTGRES_URL` overrides it. */
  readonly url?: PostgresUrlInput;
  /** How long a worker owns a leased run or delivery before another may take it, in ms. */
  readonly leaseMs?: number;
  /** How often idle workers look for due work, in ms. */
  readonly pollIntervalMs?: number;
}

/** Options for `postgresJob()`: connection settings plus the common jobs service options. @experimental */
export interface PostgresJobOptions extends PostgresConnectionOptions, JobsServiceOptions {}

/** Options for `postgresEvent()`. @experimental */
export interface PostgresEventOptions extends PostgresConnectionOptions {}
