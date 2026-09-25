import { Effect } from "effect";
import { duckdbError } from "./duckdb-error.js";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import { importLocalHistoryEffect } from "./import-history-effect.js";
import type { LocalRecord, StoredLocalRecord } from "./types.types.js";
/**
 * Imports legacy NDJSON through the scoped Effect implementation.
 *
 * @param root - Directory containing legacy segment files.
 * @param connection - Open DuckDB connection.
 * @param append - Idempotent Promise batch persistence operation.
 * @returns Imported and malformed record counts.
 * @throws {DuckdbError} If file IO or persistence fails.
 * @example
 * const summary = await importLocalHistory(root, connection, append);
 */
export function importLocalHistory(
  root: string,
  connection: DuckdbConnectionPort,
  append: (records: readonly LocalRecord[]) => Promise<readonly StoredLocalRecord[]>,
) {
  return Effect.runPromise(
    importLocalHistoryEffect(root, connection, (records) =>
      Effect.tryPromise({
        try: () => append(records),
        catch: (cause) => duckdbError("import-append", cause),
      }),
    ),
  );
}
