import type { Effect } from "effect";
import type { DuckdbError } from "./duckdb-error.js";
import type { DuckdbQueryError } from "./duckdb-query-error.js";
import type { LocalWorkerCommand } from "./types.types.js";
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
  ) => Effect.Effect<unknown, DuckdbError | DuckdbQueryError>;
  /**
   * Flushes and releases the active database Scope once.
   * @returns An Effect completing after release or a DuckdbError.
   * @example
   * yield* worker.close();
   */
  readonly close: () => Effect.Effect<void, DuckdbError>;
}
