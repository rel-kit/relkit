/** Named contracts for the Postgres backend's table layout, shared by the runtime, the Drizzle outbox and migration exports. */

/** Where the backend's tables live; both names are validated SQL identifiers. @experimental */
export interface PostgresTableOptions {
  /** Postgres schema holding the tables; defaults to `public`. */
  readonly schema?: string;
  /** Prefix for every table name; defaults to `relkit`. */
  readonly tablePrefix?: string;
}

/** Fully qualified, quoted table names for one backend namespace. @experimental */
export interface PostgresTables {
  /** Quoted schema name. */
  readonly schema: string;
  /** Job runs, leased with `FOR UPDATE SKIP LOCKED`. */
  readonly jobRuns: string;
  /** Persisted schedule definitions keyed by service and schedule ID. */
  readonly schedules: string;
  /** One row per claimed schedule occurrence, unique on (service, schedule, occurrence). */
  readonly scheduleOccurrences: string;
  /** Event outbox written by publishers, inside the caller's transaction when given one. */
  readonly eventOutbox: string;
  /** Registered event consumers that publication fans out to. */
  readonly eventConsumers: string;
  /** One delivery per (event instance, consumer), retried independently. */
  readonly eventDeliveries: string;
  /** Advisory-lock key that serializes schema creation across instances. */
  readonly lockKey: number;
}
