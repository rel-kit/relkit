/** Contracts for the shared Postgres connection owner used by the jobs and events runtimes. */
import type { Effect, Fiber } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";
import type { SqlError } from "effect/sql/SqlError";
import type { PostgresTableOptions, PostgresTables } from "../schema.types.js";

/** A background loop; it can only fail when the pool or schema cannot be acquired. @experimental */
export type BackgroundFiber = Fiber.Fiber<void, SqlError>;

/** Connection settings for one backend namespace. @experimental */
export interface PostgresDatabaseOptions extends PostgresTableOptions {
  /** Postgres connection string. */
  readonly url: string;
  /** Pool size; defaults to 10. */
  readonly maxConnections?: number;
}

/** A pooled connection plus the background fibers that depend on it. @experimental */
export interface PostgresDatabase {
  /** Quoted table names for this namespace. */
  readonly tables: PostgresTables;
  /**
   * Runs one SQL workflow; the schema is created before the first one runs.
   * @param effect - Workflow requiring the SQL client.
   * @param signal - Optional caller cancellation.
   * @returns The workflow result; failures reject the Promise.
   */
  readonly run: <A, E>(effect: Effect.Effect<A, E, SqlClient>, signal?: AbortSignal) => Promise<A>;
  /**
   * Starts a background workflow that `close()` interrupts before releasing the pool.
   * @param effect - Never-failing loop requiring the SQL client.
   * @returns The running fiber.
   */
  readonly fork: (effect: Effect.Effect<void, never, SqlClient>) => BackgroundFiber;
  /** Interrupts background fibers, then closes the pool. Safe to call twice. */
  readonly close: () => Promise<void>;
}
