import type { LocalWorkerCommand } from "./types.types.js";

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
