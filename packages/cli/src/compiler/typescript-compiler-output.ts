/**
 * Parses the complete output of `tsc --pretty false` and `tsgo --pretty false`: one line per
 * diagnostic, with or without a `file(line,column)` location, followed by indented continuation
 * lines (message chains and related information) that belong to it. Pure.
 */
import type { CompilerOutputDiagnostic } from "./typescript-compiler.types.js";

const LOCATED = /^(.+?)\((\d+),(\d+)\): (error|warning|message) (TS\d+): (.*)$/u;
const GLOBAL = /^(error|warning|message) (TS\d+): (.*)$/u;

/**
 * Splits compiler output into diagnostics.
 * @param output - Standard output of one compiler run.
 * @returns Diagnostics in printed order; summary and blank lines are dropped.
 */
export function parseCompilerOutput(output: string): readonly CompilerOutputDiagnostic[] {
  const diagnostics: CompilerOutputDiagnostic[] = [];
  let current: CompilerOutputDiagnostic | undefined;
  for (const line of output.replaceAll("\r\n", "\n").split("\n")) {
    const located = LOCATED.exec(line);
    const global = located === null ? GLOBAL.exec(line) : null;
    if (located !== null) {
      const [, file = "", lineNumber = "1", column = "1", category = "", code = "", text = ""] =
        located;
      current = {
        code,
        severity: severity(category),
        message: text,
        location: { file, line: Number(lineNumber), column: Number(column) },
      };
      diagnostics.push(current);
    } else if (global !== null) {
      const [, category = "", code = "", text = ""] = global;
      current = { code, severity: severity(category), message: text };
      diagnostics.push(current);
    } else if (current !== undefined && /^\s+\S/u.test(line)) {
      const extended = { ...current, message: `${current.message}\n${line.trimEnd()}` };
      diagnostics[diagnostics.length - 1] = extended;
      current = extended;
    } else {
      current = undefined;
    }
  }
  return diagnostics;
}

/**
 * Maps a printed category to diagnostic severity.
 * @param category - `error`, `warning` or `message`.
 * @returns The RelKit severity.
 */
function severity(category: string): CompilerOutputDiagnostic["severity"] {
  if (category === "error") return "error";
  if (category === "warning") return "warning";
  return "info";
}
