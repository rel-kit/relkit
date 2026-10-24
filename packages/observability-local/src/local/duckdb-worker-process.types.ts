/**
 * Owns duckdb worker process.types for the optional local history store.
 * Shared records and query contracts come from lightweight observability; native
 * handles and worker lifetimes remain owned by this storage package.
 */
import type { LocalWorkerCommand } from "@relkit/observability/local/record";

/**
 * IPC envelope received by the local DuckDB worker process.
 *
 * @example
 * const message: DuckdbWorkerMessage = { id: 1, command: { type: "flush" } };
 */
export interface DuckdbWorkerMessage {
  readonly id: number;
  readonly command: LocalWorkerCommand;
}

/** Tracks whether maintenance may issue database commands in this process. */
export interface DuckdbProcessState {
  opened: boolean;
}
