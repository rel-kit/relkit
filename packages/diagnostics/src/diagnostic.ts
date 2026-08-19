import {
  createSourceLocation,
  normalizeId,
  normalizeSourceLocation,
  normalizeSourcePath,
} from "@zsys/contracts";
import type { SourceLocation } from "@zsys/contracts";

export type DiagnosticSeverity = "info" | "warning" | "error";

/** A secondary source location attached to a diagnostic. */
export interface DiagnosticLocation extends SourceLocation {
  readonly message?: string;
  readonly descriptorId?: string;
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly descriptorId?: string;
  readonly related?: readonly DiagnosticLocation[];
  readonly suggestion?: string;
  readonly documentationPath?: string;
}

export type DiagnosticLocationInput = DiagnosticLocation;

export interface DiagnosticInput {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly location?: SourceLocation;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly descriptorId?: string;
  readonly descriptor?: string;
  readonly related?: readonly DiagnosticLocationInput[];
  readonly suggestion?: string;
  readonly documentationPath?: string;
  readonly docs?: string;
}

export interface DiagnosticNormalizationOptions {
  readonly projectRoot?: string;
}

type LocationLike = Pick<Diagnostic, "file" | "line" | "column">;

/** Creates an immutable diagnostic with normalized, project-relative paths. */
export function createDiagnostic(
  input: DiagnosticInput,
  options: DiagnosticNormalizationOptions = {},
): Diagnostic {
  const location = readLocation(input, options.projectRoot);
  const descriptorId = input.descriptorId ?? input.descriptor;
  const related = input.related?.map((entry) => normalizeRelated(entry, options.projectRoot));
  const documentationPath = input.documentationPath ?? input.docs;
  const value = {
    code: requiredText(input.code, "code"),
    severity: readSeverity(input.severity),
    message: requiredText(input.message, "message"),
    ...(location ?? {}),
    ...(descriptorId === undefined ? {} : { descriptorId: normalizeId(descriptorId) }),
    ...(related === undefined ? {} : { related: sortRelated(related) }),
    ...(input.suggestion === undefined ? {} : { suggestion: input.suggestion }),
    ...(documentationPath === undefined
      ? {}
      : { documentationPath: normalizeDocumentationPath(documentationPath, options.projectRoot) }),
  } as Diagnostic;
  return deepFreeze(value);
}

/** Normalizes an existing diagnostic or a diagnostic-shaped value. */
export const normalizeDiagnostic = createDiagnostic;

/** Sorts diagnostics by portable source location and stable content. */
export function sortDiagnostics(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticNormalizationOptions = {},
): readonly Diagnostic[] {
  return diagnostics
    .map((diagnostic) => createDiagnostic(diagnostic, options))
    .sort(compareDiagnostics);
}

function readLocation(
  input: DiagnosticInput,
  projectRoot: string | undefined,
): SourceLocation | undefined {
  const hasFlat =
    input.file !== undefined || input.line !== undefined || input.column !== undefined;
  if (input.location !== undefined && hasFlat) {
    throw new TypeError("Diagnostic location must use location or file/line/column, not both");
  }
  if (input.location !== undefined) return normalizeSourceLocation(input.location, projectRoot);
  if (!hasFlat) return undefined;
  if (input.file === undefined || input.line === undefined || input.column === undefined) {
    throw new TypeError("Diagnostic locations require file, line, and column");
  }
  return createSourceLocation(input.file, input.line, input.column, projectRoot);
}

function normalizeRelated(
  input: DiagnosticLocationInput,
  projectRoot: string | undefined,
): DiagnosticLocation {
  const location = normalizeSourceLocation(input, projectRoot);
  const value = {
    ...location,
    ...(input.message === undefined ? {} : { message: input.message }),
    ...(input.descriptorId === undefined ? {} : { descriptorId: normalizeId(input.descriptorId) }),
  } as DiagnosticLocation;
  return deepFreeze(value);
}

function sortRelated(locations: readonly DiagnosticLocation[]): readonly DiagnosticLocation[] {
  return Object.freeze(
    [...locations].sort((left, right) => {
      const location = compareLocations(left, right);
      if (location !== 0) return location;
      return compareText(left.message ?? "", right.message ?? "");
    }),
  );
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  const location = compareLocations(left, right);
  if (location !== 0) return location;
  const code = compareText(left.code, right.code);
  if (code !== 0) return code;
  const severity = compareText(left.severity, right.severity);
  if (severity !== 0) return severity;
  return compareText(left.message, right.message);
}

function compareLocations(left: LocationLike, right: LocationLike): number {
  const file = compareText(left.file ?? "\uffff", right.file ?? "\uffff");
  if (file !== 0) return file;
  const line = (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER);
  if (line !== 0) return line;
  return (left.column ?? Number.MAX_SAFE_INTEGER) - (right.column ?? Number.MAX_SAFE_INTEGER);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeDocumentationPath(path: string, projectRoot: string | undefined): string {
  const value = requiredText(path, "documentationPath");
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return value;
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) {
    return normalizeSourcePath(value, projectRoot);
  }
  return value.replaceAll("\\", "/");
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`Diagnostic ${label} must be a non-empty string`);
  }
  return value.trim();
}

function readSeverity(value: unknown): DiagnosticSeverity {
  if (value === "info" || value === "warning" || value === "error") return value;
  throw new TypeError("Diagnostic severity must be info, warning, or error");
}

function deepFreeze<T extends object>(value: T): T {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object" && !Object.isFrozen(child)) deepFreeze(child);
  }
  return value;
}
