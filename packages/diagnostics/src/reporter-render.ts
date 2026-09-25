import type { SourceLocation } from "@relkit/contracts";
import type { Diagnostic, DiagnosticLocation } from "./diagnostic.types.js";
import type { DiagnosticReporterOptions } from "./reporter.types.js";

/** Renders an already normalized diagnostic and optional source excerpt.
 * @param diagnostic - Normalized diagnostic.
 * @param options - Source and color settings.
 * @returns Human-readable terminal text.
 * @throws The source callback's error when called outside renderDiagnosticEffect.
 * @example renderDiagnostic({ code: "X", severity: "info", message: "Note" }, {});
 */
export function renderDiagnostic(
  diagnostic: Diagnostic,
  options: DiagnosticReporterOptions,
): string {
  const location = diagnostic.file
    ? `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`
    : undefined;
  const heading = `${location ? `${location} - ` : ""}${paint(
    diagnostic.severity,
    options.color === true,
  )} ${diagnostic.code}: ${diagnostic.message}`;
  const lines = [heading];
  if (diagnostic.file && diagnostic.line !== undefined && diagnostic.column !== undefined) {
    lines.push(
      ...renderExcerpt(
        { file: diagnostic.file, line: diagnostic.line, column: diagnostic.column },
        options.source?.(diagnostic.file),
        1,
        options.color === true,
      ),
    );
  }
  for (const related of diagnostic.related ?? []) {
    lines.push(`  related: ${formatRelated(related)}`);
    lines.push(
      ...renderExcerpt(related, options.source?.(related.file), 1, options.color === true),
    );
  }
  if (diagnostic.suggestion !== undefined) lines.push(`  suggestion: ${diagnostic.suggestion}`);
  if (diagnostic.documentationPath !== undefined)
    lines.push(`  docs: ${diagnostic.documentationPath}`);
  return lines.join("\n");
}

function renderExcerpt(
  location: SourceLocation,
  source: string | undefined,
  context: number,
  color: boolean,
): string[] {
  if (source === undefined) return [];
  const lines = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  if (location.line > lines.length) return [];
  const start = Math.max(1, location.line - context);
  const end = Math.min(lines.length, location.line + context);
  const width = String(end).length;
  const result: string[] = [];
  for (let line = start; line <= end; line += 1) {
    const marked = line === location.line;
    const marker = marked ? ">" : " ";
    const content = lines[line - 1] ?? "";
    result.push(` ${marker} ${String(line).padStart(width)} | ${content}`);
    if (marked) {
      const column = Math.min(Math.max(location.column, 1), content.length + 1);
      const caret = `   ${" ".repeat(width)} | ${" ".repeat(column - 1)}^`;
      result.push(color ? `\u001b[31m${caret}\u001b[0m` : caret);
    }
  }
  return result;
}

function formatRelated(location: DiagnosticLocation): string {
  return `${location.file}:${location.line}:${location.column}${
    location.message === undefined ? "" : ` - ${location.message}`
  }`;
}

function paint(severity: string, color: boolean): string {
  if (!color) return severity;
  const code = severity === "error" ? 31 : severity === "warning" ? 33 : 36;
  return `\u001b[${code}m${severity}\u001b[0m`;
}
