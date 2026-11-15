/**
 * Reads the located parse errors out of an import that failed because a module does not parse.
 * Bun rejects such an import with an `AggregateError` whose entries (`BuildMessage`) carry
 * `message` and `position: { file, line, column }` (one-based); on Node the CLI's TypeScript hooks
 * transpile with esbuild, whose rejection carries `errors` entries with `text` and
 * `location: { file, line, column }` (one-based line, zero-based column). Both are mapped to
 * {@link EvaluatorBuildError} with project-relative files, so the evaluator's import failure names
 * the parse error's own location and message instead of line 1 and "2 errors building <absolute
 * path>". `evaluator-unparsed-modules.ts` uses the same evidence to tell a parse failure apart.
 */
import { isAbsolute, relative } from "node:path";
import type { EvaluatorBuildError } from "./evaluator-protocol.types.js";

/** Parse errors kept per import failure; the first locates the diagnostic, the rest are listed. */
export const MAX_BUILD_ERRORS = 5;

/** Located parse errors of one failed import, and the absolute files they are in. */
export interface ImportBuildErrors {
  /** Errors with project-relative files, in the runtime's order, at most {@link MAX_BUILD_ERRORS}. */
  readonly errors: readonly EvaluatorBuildError[];
  /** Distinct absolute files that failed to parse, for eviction from the module registry. */
  readonly files: readonly string[];
}

/**
 * Extracts located parse errors from an import rejection.
 * @param error - Native import rejection.
 * @param projectRoot - Absolute project root the files are made relative to.
 * @returns The located errors and their files; both empty when the rejection is not a parse error.
 */
export function importBuildErrors(error: unknown, projectRoot: string): ImportBuildErrors {
  const entries =
    typeof error === "object" && error !== null && "errors" in error && Array.isArray(error.errors)
      ? error.errors
      : [];
  const located = entries.flatMap((entry) => locate(entry));
  const files = [...new Set(located.map((entry) => entry.file))];
  return {
    errors: located.slice(0, MAX_BUILD_ERRORS).map((entry) => ({
      ...entry,
      file: portable(entry.file, projectRoot),
    })),
    files,
  };
}

/**
 * Locates one native build message: Bun's `BuildMessage` or an esbuild message.
 * @param entry - One entry of the rejection's `errors`.
 * @returns The error with its absolute file and one-based position, or nothing when unlocated.
 */
function locate(entry: unknown): EvaluatorBuildError[] {
  if (typeof entry !== "object" || entry === null) return [];
  const bun = "position" in entry ? positionOf(entry.position) : undefined;
  const esbuild = "location" in entry ? positionOf(entry.location) : undefined;
  const text =
    "message" in entry && typeof entry.message === "string"
      ? entry.message
      : "text" in entry && typeof entry.text === "string"
        ? entry.text
        : undefined;
  if (text === undefined) return [];
  if (bun !== undefined) return [{ ...bun, message: text }];
  // esbuild columns count from zero.
  if (esbuild !== undefined) return [{ ...esbuild, column: esbuild.column + 1, message: text }];
  return [];
}

/**
 * Reads a native `{ file, line, column }` position.
 * @param position - Position object of a build message.
 * @returns The position, or undefined when a field is missing.
 */
function positionOf(
  position: unknown,
): { readonly file: string; readonly line: number; readonly column: number } | undefined {
  if (typeof position !== "object" || position === null) return undefined;
  if (!("file" in position && "line" in position && "column" in position)) return undefined;
  const { file, line, column } = position;
  if (typeof file !== "string" || file === "") return undefined;
  if (typeof line !== "number" || typeof column !== "number") return undefined;
  return { file, line, column };
}

/**
 * Makes a parse error's file project-relative with forward slashes.
 * @param file - Absolute file named by the runtime.
 * @param projectRoot - Absolute project root.
 * @returns The relative path; a file outside the root keeps its `..` segments, never the root.
 */
function portable(file: string, projectRoot: string): string {
  if (!isAbsolute(file)) return file.replaceAll("\\", "/");
  return relative(projectRoot, file).replaceAll("\\", "/");
}
