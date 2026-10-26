/**
 * Owns duckdb worker.types for the optional local history store.
 * Shared records and query contracts come from lightweight observability; native
 * handles and worker lifetimes remain owned by this storage package.
 */
import type { Effect } from "effect";
import type { DuckdbDatabaseEffects } from "./duckdb-database.types.js";
import type { DuckdbError } from "./duckdb-error.js";
import type { DuckdbQueryError } from "./duckdb-query-error.js";
import type { LocalWorkerCommand } from "@relkit/observability/local/record";
/**
 * Serialized command operations for the local DuckDB worker.
 * The Layer owns any open database until its Scope closes.
 *
 * @example
 * const worker = yield* DuckdbWorkerService;
 * yield* worker.execute({ type: "flush" });
 */
export interface DuckdbWorkerEffects {
  /**
   * Executes one IPC command with a tagged database or query failure.
   * @param command - Open, append, query, retention, flush, or close command.
   * @returns An Effect with the command result or tagged failure.
   * @example
   * const summary = yield* worker.execute({ type: "open", root });
   */
  readonly execute: (
    command: LocalWorkerCommand,
  ) => Effect.Effect<DuckdbWorkerResult, DuckdbError | DuckdbQueryError>;
  /**
   * Flushes and releases the active database Scope once.
   * @returns An Effect completing after release or a DuckdbError.
   * @example
   * yield* worker.close();
   */
  readonly close: () => Effect.Effect<void, DuckdbError>;
}

/** Actual command results before JSON serialization at the IPC boundary. */
export type DuckdbWorkerResult =
  | void
  | DuckdbDatabaseEffects["imported"]
  | Effect.Success<ReturnType<DuckdbDatabaseEffects["append"]>>
  | Effect.Success<ReturnType<DuckdbDatabaseEffects["list"]>>
  | Effect.Success<ReturnType<DuckdbDatabaseEffects["detail"]>>;
