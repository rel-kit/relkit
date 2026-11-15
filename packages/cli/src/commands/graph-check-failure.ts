/**
 * Explains a missing graph from the diagnostics the last `relkit check` wrote next to it: check
 * writes the graph only when it passes, so "run relkit check" alone cannot help after a failure.
 */
import { join } from "node:path";
import { Effect } from "effect";
import { GENERATED_ARTIFACT_FILES } from "../compiler/index.js";

/** Fields of a written diagnostic that the summary names. */
interface WrittenDiagnostic {
  readonly code?: unknown;
  readonly severity?: unknown;
  readonly message?: unknown;
  readonly file?: unknown;
  readonly line?: unknown;
  readonly column?: unknown;
}

/**
 * Summarizes the errors of the last check in a generated directory.
 * @param files - Filesystem capability; only `readText` is used.
 * @param directory - Directory that should hold the graph.
 * @returns Lazily, a sentence starting with a space that gives the error count and the first
 * error, or an empty string when no diagnostics file exists or it holds no error. Never fails.
 * @example
 * ```ts
 * const detail = yield* lastCheckFailure(files, "/app/.relkit/generated");
 * // " The last relkit check failed with 1 error; the first is src/a.ts:2:1 RELKIT_…: …"
 * ```
 */
export const lastCheckFailure = Effect.fn("GraphFiles.lastCheckFailure")(function* <E>(
  files: { readonly readText: (path: string) => Effect.Effect<string, E> },
  directory: string,
) {
  const text = yield* files
    .readText(join(directory, GENERATED_ARTIFACT_FILES.diagnostics))
    .pipe(Effect.orElseSucceed(() => "[]"));
  const errors = parseDiagnostics(text).filter((entry) => entry.severity === "error");
  const first = errors[0];
  if (first === undefined) return "";
  const location =
    typeof first.file === "string"
      ? `${first.file}:${String(first.line)}:${String(first.column)} `
      : "";
  const count = errors.length === 1 ? "1 error" : `${errors.length} errors`;
  return ` The last relkit check failed with ${count}; the first is ${location}${String(first.code)}: ${String(first.message)}`;
});

/**
 * Reads a diagnostics file leniently.
 * @param text - File contents.
 * @returns Its entries, or none when it is not a JSON array.
 */
function parseDiagnostics(text: string): readonly WrittenDiagnostic[] {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is WrittenDiagnostic => typeof entry === "object" && entry !== null,
        )
      : [];
  } catch {
    return [];
  }
}
