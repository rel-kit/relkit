/**
 * Parses the line-oriented output of `tsc --watch --pretty false` (and `tsgo`, which prints
 * the same shapes): one line per diagnostic, a start banner per pass and a summary line per
 * finished pass. Pure; unrecognized lines, such as diagnostic continuations, are ignored.
 */
import { isAbsolute, relative } from "node:path";
import type { TypecheckLine } from "./typecheck-output.types.js";

const DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.*)$/u;
const FINISHED = /Found (\d+) errors?\b/u;
const STARTED = /(Starting compilation in watch mode|File change detected)/u;

/**
 * Classifies one output line.
 * @param line - Line without its newline.
 * @param projectRoot - Root used to make file paths project-relative.
 * @returns A diagnostic, a pass boundary, or `other`.
 */
export function parseTypecheckLine(line: string, projectRoot: string): TypecheckLine {
  // Watch output prefixes lines with a timestamp such as "12:00:00 AM - ".
  const text = line.replace(/^\[?\d{1,2}:\d{2}:\d{2}(?:\s?[AP]M)?\]?\s+-\s+/u, "").trim();
  const diagnostic = DIAGNOSTIC.exec(text);
  if (diagnostic !== null) {
    const [, file = "", lineNumber = "1", column = "1", , code = "", message = ""] = diagnostic;
    return {
      kind: "diagnostic",
      diagnostic: {
        file: isAbsolute(file) ? relative(projectRoot, file).replaceAll("\\", "/") : file,
        line: Number(lineNumber),
        column: Number(column),
        code,
        message,
      },
    };
  }
  const finished = FINISHED.exec(text);
  if (finished !== null) return { kind: "finished", errors: Number(finished[1]) };
  if (STARTED.test(text)) return { kind: "started" };
  return { kind: "other" };
}
