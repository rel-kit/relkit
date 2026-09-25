import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { createInterface } from "node:readline";
import { Effect, Stream } from "effect";
import type { ObservabilityRecord } from "../model.js";
import { duckdbError } from "./duckdb-error.js";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import { observeDuckdb } from "./duckdb-metrics.js";
import { readDuckdbSql, runDuckdbSql } from "./duckdb-sql.js";
import type { LegacyAppend, LegacyImportSummary } from "./import-history.types.js";
import { validateLocalRecord } from "./types.js";
import type { LocalRecord } from "./types.types.js";
const files: (root: string) => Effect.Effect<string[], ReturnType<typeof duckdbError>> = Effect.fn(
  "ObservabilityDuckdb.import.files",
)(function* (root: string) {
  const entries = yield* Effect.tryPromise({
    try: () => readdir(root, { withFileTypes: true }),
    catch: (cause) => duckdbError("import-files", cause),
  });
  const nested = yield* Effect.forEach(
    entries,
    (item) =>
      Effect.gen(function* () {
        const path = join(root, item.name);
        return item.isDirectory()
          ? yield* files(path)
          : item.isFile() && item.name.endsWith(".ndjson")
            ? [path]
            : [];
      }),
    { concurrency: 1 },
  );
  return nested.flat().sort();
});
const fingerprint = Effect.fn("ObservabilityDuckdb.import.fingerprint")(function* (path: string) {
  const hash = createHash("sha256");
  yield* Effect.acquireUseRelease(
    Effect.sync(() => createReadStream(path)),
    (input) =>
      Stream.runForEach(
        Stream.fromAsyncIterable(input, (cause) => duckdbError("import-read", cause)),
        (chunk) =>
          Effect.sync(() => {
            hash.update(chunk);
          }),
      ),
    (input) =>
      Effect.sync(() => {
        input.destroy();
      }),
  );
  return hash.digest("hex");
});
/**
 * Imports legacy segment files in stable order under Effect-managed file scopes.
 *
 * @param root - Directory containing legacy NDJSON segments.
 * @param connection - Scoped DuckDB connection with imports and receipts tables.
 * @param append - Idempotent Effect batch persistence operation.
 * @returns An Effect with imported and malformed counts or a tagged IO error.
 * @example
 * const summary = yield* importLocalHistoryEffect(root, connection, storage.append);
 */
export const importLocalHistoryEffect = Effect.fn("ObservabilityDuckdb.import")(function* (
  root: string,
  connection: DuckdbConnectionPort,
  append: LegacyAppend,
) {
  return yield* observeDuckdb(
    "import",
    Effect.gen(function* () {
      let records = 0;
      let malformed = 0;
      for (const path of yield* files(root)) {
        const sourcePath = relative(root, path).replace(/\.active\.ndjson$/, ".ndjson");
        const source = `${sourcePath}:${yield* fingerprint(path)}`;
        const exists = yield* readDuckdbSql(
          connection,
          "import",
          "SELECT source FROM imports WHERE source = ?",
          [source],
        );
        if (exists.getRowObjectsJson().length > 0) continue;
        const result = yield* Effect.acquireUseRelease(
          Effect.sync(() => {
            const stream = createReadStream(path);
            return { stream, input: createInterface({ input: stream, crlfDelay: Infinity }) };
          }),
          ({ input }) =>
            Effect.gen(function* () {
              let lineNumber = 0;
              let bad = 0;
              let pending: LocalRecord[] = [];
              yield* Stream.runForEach(
                Stream.fromAsyncIterable(input, (cause) => duckdbError("import-read", cause)),
                (line) =>
                  Effect.gen(function* () {
                    lineNumber++;
                    if (!line.trim()) return;
                    const item = yield* Effect.try({
                      try: () => {
                        const record = JSON.parse(line) as ObservabilityRecord;
                        const item: LocalRecord = {
                          key: `legacy:${sourcePath}:${lineNumber}:${createHash("sha256").update(line).digest("hex")}`,
                          record,
                          origin:
                            record.signal === "log" && record.component.startsWith("cli.")
                              ? "relkit"
                              : record.signal === "log" && record.component === "inspector"
                                ? "inspector"
                                : "application",
                        };
                        validateLocalRecord(item);
                        return item;
                      },
                      catch: (cause) => duckdbError("import-decode", cause),
                    }).pipe(Effect.option);
                    if (item._tag === "None") {
                      bad++;
                      return;
                    }
                    pending.push(item.value);
                    if (pending.length === 256) {
                      records += (yield* append(pending)).length;
                      pending = [];
                    }
                  }),
              );
              if (pending.length) records += (yield* append(pending)).length;
              yield* runDuckdbSql(
                connection,
                "import",
                "INSERT INTO imports VALUES (?, ?) ON CONFLICT DO NOTHING",
                [source, bad],
              );
              return bad;
            }),
          ({ input, stream }) =>
            Effect.sync(() => {
              input.close();
              stream.destroy();
            }),
        );
        malformed += result;
      }
      return { records, malformed } satisfies LegacyImportSummary;
    }),
  );
});
