/**
 * Imports existing history in stable path order using original path/hash markers.
 * Source files, receipt identities, malformed counts and applied schema stay intact.
 */
import { relative } from "node:path";
import { Effect } from "effect";
import { readDuckdbSql, runDuckdbSql } from "./duckdb-sql.js";
import { historyFiles, historyFingerprint } from "./import-history-files.js";
import { importLegacyLines } from "./import-history-lines.js";
import { observeDuckdb } from "./duckdb-metrics.js";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import type { LegacyAppend } from "./import-history.types.js";

/** @param root - Unchanged diagnostic history root. @param connection - Scoped native connection. @param append - Idempotent append operation. @returns Original import summary or typed IO/storage failure. */
export const importLocalHistoryEffect = Effect.fn("ObservabilityDuckdb.import")(function* (
  root: string,
  connection: DuckdbConnectionPort,
  append: LegacyAppend,
) {
  return yield* observeDuckdb(
    "import",
    Effect.gen(function* () {
      const summaries = yield* Effect.forEach(
        yield* historyFiles(root),
        (path) => importHistoryFile(root, path, connection, append),
        { concurrency: 1 },
      );
      return summaries.reduce(
        (total, item) => ({
          records: total.records + item.records,
          malformed: total.malformed + item.malformed,
        }),
        { records: 0, malformed: 0 },
      );
    }),
  );
});

/** @param root - History root. @param path - Existing segment. @param connection - Native imports table. @param append - Transactional writer. @returns Counts for a new file fingerprint, or zero for an existing import. */
const importHistoryFile = Effect.fn("ObservabilityDuckdb.import.file")(function* (
  root: string,
  path: string,
  connection: DuckdbConnectionPort,
  append: LegacyAppend,
) {
  const sourcePath = relative(root, path).replace(/\.active\.ndjson$/, ".ndjson");
  const source = `${sourcePath}:${yield* historyFingerprint(path)}`;
  const exists = yield* readDuckdbSql(
    connection,
    "import",
    "SELECT source FROM imports WHERE source = ?",
    [source],
  );
  if (exists.getRowObjectsJson().length > 0) return { records: 0, malformed: 0 };
  const summary = yield* importLegacyLines(path, sourcePath, append);
  yield* runDuckdbSql(
    connection,
    "import",
    "INSERT INTO imports VALUES (?, ?) ON CONFLICT DO NOTHING",
    [source, summary.malformed],
  );
  return summary;
});
