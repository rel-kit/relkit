/** Derives unchanged path/line/hash receipt keys and admits bounded legacy batches. */
import { createHash } from "node:crypto";
import { Effect } from "effect";
import { validateLocalRecord } from "@relkit/observability/local/record";
import type { LocalRecord } from "@relkit/observability/local/record";
import { duckdbError } from "./duckdb-error.js";
import type { LegacyAppend } from "./import-history.types.js";
import type { LegacyLineState } from "./import-history-lines.types.js";

/** @param sourcePath - Normalized relative segment path. @param lineNumber - Original physical line. @param line - Untrusted NDJSON. @returns A validated legacy envelope. */
function decodeLegacyLine(sourcePath: string, lineNumber: number, line: string): LocalRecord {
  const record = JSON.parse(line);
  const envelope = {
    key: `legacy:${sourcePath}:${lineNumber}:${createHash("sha256").update(line).digest("hex")}`,
    record,
    origin: legacyOrigin(record),
  };
  validateLocalRecord(envelope);
  return envelope;
}

/** @typeParam Record - Foreign parsed record. @param record - Parsed input narrowed before property use. @returns Existing legacy CLI/application source attribution. */
function legacyOrigin<Record>(record: Record): LocalRecord["origin"] {
  if (
    record === null ||
    typeof record !== "object" ||
    !("signal" in record) ||
    record.signal !== "log" ||
    !("component" in record) ||
    typeof record.component !== "string"
  )
    return "application";
  if (record.component.startsWith("cli.")) return "relkit";
  if (record.component === "inspector") return "inspector";
  return "application";
}

/** @param state - Per-file identity and batch state. @param line - Original file line. @param append - Transactional idempotent writer. @returns Completion after admission or one malformed count. */
export const importLegacyLine = Effect.fn("ObservabilityDuckdb.import.line")(function* (
  state: LegacyLineState,
  line: string,
  append: LegacyAppend,
) {
  state.lineNumber++;
  if (!line.trim()) return;
  const item = yield* Effect.try({
    try: () => decodeLegacyLine(state.sourcePath, state.lineNumber, line),
    catch: (cause) => duckdbError("import-decode", cause),
  }).pipe(Effect.option);
  if (item._tag === "None") {
    state.malformed++;
    return;
  }
  state.pending.push(item.value);
  if (state.pending.length === 256) {
    state.records += (yield* append(state.pending)).length;
    state.pending = [];
  }
});
