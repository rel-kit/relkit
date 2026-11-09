import type { DiagnosticInput } from "./diagnostic.types.js";

/** Output configuration and optional source text provider.
 * The source callback receives normalized paths and is read only during formatting.
 * @example const options: DiagnosticReporterOptions = { color: false };
 */
export interface DiagnosticReporterOptions {
  readonly projectRoot?: string;
  readonly source?: (file: string) => string | undefined;
  readonly color?: boolean;
}

/** Portable annotation for CI systems.
 * Location fields are omitted when the input has no location.
 * @example const annotation: CiAnnotation = { level: "error", title: "X", message: "Bad" };
 */
export interface CiAnnotation {
  readonly level: "notice" | "warning" | "error";
  readonly title: string;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
}

/** Three presentation methods sharing one normalization policy.
 * Methods may throw TypeError for invalid diagnostic fields.
 * @example const reporter: DiagnosticReporter = createDiagnosticReporter();
 */
export interface DiagnosticReporter {
  /** Formats a batch.
   * @param diagnostics - Inputs to format.
   * @returns Human-readable text.
   * @throws TypeError for invalid input or the original source provider error.
   * @example reporter.text(inputs);
   */
  readonly text: (diagnostics: readonly DiagnosticInput[]) => string;
  /** Serializes a batch.
   * @param diagnostics - Inputs to serialize.
   * @returns Canonical JSON.
   * @throws TypeError for invalid input.
   * @example reporter.json(inputs);
   */
  readonly json: (diagnostics: readonly DiagnosticInput[]) => string;
  /** Encodes a batch.
   * @param diagnostics - Inputs to encode.
   * @returns CI commands.
   * @throws TypeError for invalid input.
   * @example reporter.ci(inputs);
   */
  readonly ci: (diagnostics: readonly DiagnosticInput[]) => string;
}
