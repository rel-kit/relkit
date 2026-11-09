/** Contracts of the Postgres jobs runtime: construction options, worker registration and the runtime surface. */
import type { JsonValue } from "relkit/contracts";
import type {
  JobsAdapterRuntime,
  NativeScheduleOperations,
  TaskExecutor,
} from "relkit/jobs/adapter";
import type { PostgresDatabase, PostgresDatabaseOptions } from "./database.types.js";
import type { PostgresJobWorker } from "./jobs-worker.js";
import type { ClaimedOccurrence } from "./schedules-tick.js";

/** Faults a test can inject at the provider boundary. @experimental */
export interface PostgresFaults {
  /** Commit submissions but report their outcome as unknown, as after a lost response. */
  readonly loseSubmitResponse?: boolean;
}

/** Options for `createPostgresJobsRuntime`. @experimental */
export interface PostgresJobsRuntimeOptions extends Partial<PostgresDatabaseOptions> {
  /** Shared connection owner; when given, `url` is ignored and `close()` leaves it open. */
  readonly database?: PostgresDatabase;
  /** Jobs service (profile) name; defaults to `postgres`. */
  readonly service?: string;
  /** Lease duration in ms; defaults to 30 000. */
  readonly leaseMs?: number;
  /** Idle polling interval for the scheduler and worker loops in ms; defaults to 1 000. */
  readonly pollIntervalMs?: number;
  /** Prefix of owner tokens and occurrence claims; defaults to a random instance ID. */
  readonly workerId?: string;
  /** Test-only fault injection. */
  readonly faults?: PostgresFaults;
}

/** A task binding the generated server registers for each job. @experimental */
export interface PostgresTaskDefinition {
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion?: string;
  readonly version?: string;
  readonly buildId: string;
  readonly policy?: JsonValue;
}

/** Arguments of `registerWorker`, matching what the generated server passes. @experimental */
export interface PostgresWorkerRegistration {
  readonly definitions: readonly PostgresTaskDefinition[];
  readonly executor: TaskExecutor;
  /** False in the `api` role: this instance only submits, and runs no scheduler. */
  readonly startWorker?: boolean;
}

/** Handle the generated server awaits and closes. @experimental */
export interface PostgresWorkerHandle {
  readonly definitions: readonly PostgresTaskDefinition[];
  readonly ready: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/** Options for running task attempts in this process without the generated server. @experimental */
export interface PostgresWorkerLoopOptions {
  /** Executes one envelope; the generated server passes its task executor. */
  readonly executor: TaskExecutor;
  /** Concurrent attempts; defaults to 1. */
  readonly concurrency?: number;
}

/** The Postgres jobs adapter plus its worker, scheduler and loop controls. @experimental */
export interface PostgresJobsRuntime extends JobsAdapterRuntime {
  readonly database: PostgresDatabase;
  readonly worker: PostgresJobWorker;
  readonly schedules: NativeScheduleOperations;
  readonly registerWorker: (options: PostgresWorkerRegistration) => PostgresWorkerHandle;
  /** Runs one scheduler pass now. */
  readonly tickSchedules: () => Promise<readonly ClaimedOccurrence[]>;
  /** Starts the background scheduler loop; idempotent. */
  readonly startScheduler: () => void;
  /** Starts background loops that lease and execute runs in this process. */
  readonly startWorkers: (options: PostgresWorkerLoopOptions) => void;
  /** Leases and executes at most one run; resolves true when one ran. */
  readonly processNext: (executor: TaskExecutor) => Promise<boolean>;
}
