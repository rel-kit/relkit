import type { SourceLocation } from "@relkit/contracts";

/** Severity used to rank and display diagnostics.
 * @example const severity: DiagnosticSeverity = "warning";
 */
export type DiagnosticSeverity = "info" | "warning" | "error";

/** A secondary source location attached to a diagnostic.
 * Paths and coordinates follow the normalized SourceLocation contract.
 * @example const location: DiagnosticLocation = { file: "src/a.ts", line: 1, column: 1 };
 */
export interface DiagnosticLocation extends SourceLocation {
  readonly message?: string;
  readonly descriptorId?: string;
}

/** Immutable, portable diagnostic emitted by RELKIT tools.
 * Instances returned by createDiagnostic are deeply frozen.
 * @example const diagnostic: Diagnostic = createDiagnostic({ code: "X", severity: "info", message: "Note" });
 */
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

/** Location accepted before normalization.
 * @example const related: DiagnosticLocationInput = { file: "src/a.ts", line: 1, column: 1 };
 */
export type DiagnosticLocationInput = DiagnosticLocation;

/** User supplied diagnostic fields and compatibility aliases.
 * Use location or the complete flat file, line, and column tuple.
 * @example const input: DiagnosticInput = { code: "X", severity: "error", message: "Bad" };
 */
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

/** Controls portable path normalization.
 * @example const options: DiagnosticNormalizationOptions = { projectRoot: "/project" };
 */
export interface DiagnosticNormalizationOptions {
  readonly projectRoot?: string;
}

/** Fields participating in source order.
 * @example const location: LocationLike = { file: "src/a.ts", line: 1, column: 2 };
 */
export type LocationLike = Pick<Diagnostic, "file" | "line" | "column">;
