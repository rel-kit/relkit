import { canonicalJson } from "@zsys/contracts";
import type { SourceLocation } from "@zsys/contracts";
import {
  createDiagnostic,
  sortDiagnostics,
  type Diagnostic,
  type DiagnosticInput,
  type DiagnosticLocation,
} from "./diagnostic.js";

export interface DiagnosticReporterOptions {
  readonly projectRoot?: string;
  readonly source?: (file: string) => string | undefined;
  readonly color?: boolean;
}

export interface CiAnnotation {
  readonly level: "notice" | "warning" | "error";
  readonly title: string;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
}

/** Formats one diagnostic for a deterministic human-readable terminal. */
export function formatDiagnostic(
  input: DiagnosticInput,
  options: DiagnosticReporterOptions = {},
): string {
  const diagnostic = createDiagnostic(input, options);
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
        readSource(diagnostic.file, options),
        1,
        options.color === true,
      ),
    );
  }
  for (const related of diagnostic.related ?? []) {
    lines.push(`  related: ${formatRelated(related)}`);
    lines.push(
      ...renderExcerpt(related, readSource(related.file, options), 1, options.color === true),
    );
  }
  if (diagnostic.suggestion !== undefined) lines.push(`  suggestion: ${diagnostic.suggestion}`);
  if (diagnostic.documentationPath !== undefined) {
    lines.push(`  docs: ${diagnostic.documentationPath}`);
  }
  return lines.join("\n");
}

/** Formats diagnostics in stable source/content order. */
export function formatDiagnostics(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticReporterOptions = {},
): string {
  return sortDiagnostics(diagnostics, options)
    .map((diagnostic) => formatDiagnostic(diagnostic, options))
    .join("\n");
}

/** Serializes diagnostics with recursively sorted object keys for machine consumers. */
export function serializeDiagnostics(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticReporterOptions = {},
): string {
  return canonicalJson(sortDiagnostics(diagnostics, options));
}

export const diagnosticsToJson = serializeDiagnostics;

/** Converts diagnostics into portable CI annotations without absolute paths. */
export function toCiAnnotations(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticReporterOptions = {},
): readonly CiAnnotation[] {
  return Object.freeze(
    sortDiagnostics(diagnostics, options).map((diagnostic) =>
      Object.freeze({
        level: diagnostic.severity === "info" ? "notice" : diagnostic.severity,
        title: diagnostic.code,
        message: diagnostic.message,
        code: diagnostic.code,
        ...(diagnostic.file === undefined ? {} : { file: diagnostic.file }),
        ...(diagnostic.line === undefined ? {} : { line: diagnostic.line }),
        ...(diagnostic.column === undefined ? {} : { column: diagnostic.column }),
      }),
    ),
  );
}

/** Encodes CI annotations using GitHub Actions' portable command format. */
export function formatCiAnnotations(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticReporterOptions = {},
): string {
  return toCiAnnotations(diagnostics, options)
    .map((annotation) => {
      const properties = [
        annotation.file === undefined ? undefined : `file=${escapeCommand(annotation.file)}`,
        annotation.line === undefined ? undefined : `line=${annotation.line}`,
        annotation.column === undefined ? undefined : `col=${annotation.column}`,
        `title=${escapeCommand(annotation.title)}`,
      ]
        .filter((property): property is string => property !== undefined)
        .join(",");
      return `::${annotation.level}${properties ? ` ${properties}` : ""}::${escapeCommand(annotation.message)}`;
    })
    .join("\n");
}

/** Creates compiler/inspector/CI adapters sharing one normalization policy. */
export function createDiagnosticReporter(options: DiagnosticReporterOptions = {}) {
  return Object.freeze({
    text: (diagnostics: readonly DiagnosticInput[]) => formatDiagnostics(diagnostics, options),
    json: (diagnostics: readonly DiagnosticInput[]) => serializeDiagnostics(diagnostics, options),
    ci: (diagnostics: readonly DiagnosticInput[]) => formatCiAnnotations(diagnostics, options),
  });
}

export type DiagnosticReporter = ReturnType<typeof createDiagnosticReporter>;

function readSource(file: string, options: DiagnosticReporterOptions): string | undefined {
  if (options.source) return options.source(file);
  return undefined;
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

function escapeCommand(value: string): string {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A")
    .replaceAll(":", "%3A")
    .replaceAll(",", "%2C");
}
