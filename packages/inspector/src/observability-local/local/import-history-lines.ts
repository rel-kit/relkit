/** Streams one legacy NDJSON source with owned reader handles and sequential receipt identity. */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Effect, Stream } from "effect";
import { duckdbError } from "./duckdb-error.js";
import { importLegacyLine } from "./import-history-line.js";
import type { LegacyAppend } from "./import-history.types.js";
import type { LegacyLineState } from "./import-history-lines.types.js";

/** @param path - Existing segment file. @param sourcePath - Stable normalized relative path. @param append - Idempotent transactional append. @returns Accepted/malformed counts after all file handles close. */
export const importLegacyLines = Effect.fn("ObservabilityDuckdb.import.lines")(function* (
  path: string,
  sourcePath: string,
  append: LegacyAppend,
) {
  const state: LegacyLineState = {
    sourcePath,
    lineNumber: 0,
    malformed: 0,
    records: 0,
    pending: [],
  };
  yield* Effect.acquireUseRelease(
    Effect.sync(() => {
      const stream = createReadStream(path);
      return { stream, input: createInterface({ input: stream, crlfDelay: Infinity }) };
    }),
    ({ input }) =>
      Stream.runForEach(
        Stream.fromAsyncIterable(input, (cause) => duckdbError("import-read", cause)),
        (line) => importLegacyLine(state, line, append),
      ),
    ({ input, stream }) =>
      Effect.sync(() => {
        input.close();
        stream.destroy();
      }),
  );
  if (state.pending.length) state.records += (yield* append(state.pending)).length;
  return { records: state.records, malformed: state.malformed };
});
