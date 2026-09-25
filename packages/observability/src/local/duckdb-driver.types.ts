import type { DuckDBValue } from "@duckdb/node-api";
import type { Effect } from "effect";
import type { DuckdbError } from "./duckdb-error.js";

/**
 * SQL result shape used by the local observability store.
 *
 * @example
 * const rows = result.getRowObjectsJson();
 */
export interface DuckdbRows {
  /**
   * Returns JSON-compatible rows from a completed statement.
   * @returns Row objects decoded by the native driver.
   * @example
   * const rows = result.getRowObjectsJson();
   */
  readonly getRowObjectsJson: () => Record<string, unknown>[];
}

/**
 * Substitutable DuckDB connection with the operations used by this package.
 * The owning Effect Scope calls `closeSync` after all operations settle.
 *
 * @example
 * const result = await connection.runAndReadAll("SELECT 1");
 */
export interface DuckdbConnectionPort {
  /**
   * Runs a statement or transaction command.
   * @param sql - SQL statement.
   * @param values - Bound parameters.
   * @returns Native completion result.
   * @example
   * await connection.run("CHECKPOINT");
   */
  readonly run: (sql: string, values?: DuckDBValue[]) => Promise<unknown>;
  /**
   * Reads all rows from a completed statement.
   * @param sql - SQL query.
   * @param values - Bound parameters.
   * @returns A Promise containing a row reader.
   * @example
   * const rows = await connection.runAndReadAll("SELECT 1");
   */
  readonly runAndReadAll: (sql: string, values?: DuckDBValue[]) => Promise<DuckdbRows>;
  /**
   * Releases the native connection from its Scope finalizer.
   * @returns Nothing after release.
   * @example
   * connection.closeSync();
   */
  readonly closeSync: () => void;
}

/**
 * Native database instance owned by the acquiring Effect Scope.
 *
 * @example
 * const connection = await instance.connect();
 */
export interface DuckdbInstancePort {
  /**
   * Opens a connection owned by the same Scope.
   * @returns A Promise containing the live connection.
   * @example
   * const connection = await instance.connect();
   */
  readonly connect: () => Promise<DuckdbConnectionPort>;
  /**
   * Releases the native instance after its connection closes.
   * @returns Nothing after release.
   * @example
   * instance.closeSync();
   */
  readonly closeSync: () => void;
}

/**
 * Creates a native instance; tests can supply deterministic handles.
 *
 * @example
 * const instance = yield* driver.create(path);
 */
export interface DuckdbDriver {
  /**
   * Creates an instance at the requested database path.
   * @param path - Private DuckDB database path.
   * @returns An Effect yielding an instance or a tagged IO error.
   * @example
   * const instance = yield* driver.create(path);
   */
  readonly create: (path: string) => Effect.Effect<DuckdbInstancePort, DuckdbError>;
}
