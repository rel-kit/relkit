/**
 * Owns import history effect for the optional local history store.
 * Shared records and query contracts come from lightweight observability; native
 * handles and worker lifetimes remain owned by this storage package.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { createInterface } from "node:readline";
import { Effect, Stream } from "effect";
import { duckdbError } from "./duckdb-error.js";
export const historyFiles: (
  root: string,
) => Effect.Effect<string[], ReturnType<typeof duckdbError>> = Effect.fn(
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
          ? yield* historyFiles(path)
          : item.isFile() && item.name.endsWith(".ndjson")
            ? [path]
            : [];
      }),
    { concurrency: 1 },
  );
  return nested.flat().sort();
});
export const historyFingerprint = Effect.fn("ObservabilityDuckdb.import.fingerprint")(function* (
  path: string,
) {
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
