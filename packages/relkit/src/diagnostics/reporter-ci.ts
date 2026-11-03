import { Effect } from "effect";
import { sortDiagnosticsEffect } from "./diagnostic.js";
import { DiagnosticValidationError } from "./diagnostic-error.js";
import { observeDiagnostic, runDiagnostic } from "./diagnostic-observability.js";
import type { DiagnosticInput } from "./diagnostic.types.js";
import type { CiAnnotation, DiagnosticReporterOptions } from "./reporter.types.js";

/** Converts diagnostics into portable CI annotations in an Effect.
 * @param diagnostics - Diagnostics to convert.
 * @param options - Path normalization options.
 * @returns Effect containing annotations or DiagnosticValidationError.
 * @example Effect.runSync(toCiAnnotationsEffect([]));
 */
export function toCiAnnotationsEffect(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticReporterOptions = {},
): Effect.Effect<readonly CiAnnotation[], DiagnosticValidationError> {
  return observeDiagnostic(
    "annotations",
    Effect.map(sortDiagnosticsEffect(diagnostics, options), (values) =>
      Object.freeze(
        values.map((diagnostic) =>
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
      ),
    ),
  );
}

/** Converts diagnostics into portable CI annotations without absolute paths.
 * @param diagnostics - Diagnostics to convert.
 * @param options - Path normalization options.
 * @returns Frozen annotations.
 * @throws TypeError for invalid diagnostic fields.
 * @example toCiAnnotations([]);
 */
export function toCiAnnotations(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticReporterOptions = {},
): readonly CiAnnotation[] {
  return runDiagnostic(toCiAnnotationsEffect(diagnostics, options));
}

/** Encodes CI annotations as GitHub Actions commands in an Effect.
 * @param diagnostics - Diagnostics to encode.
 * @param options - Path normalization options.
 * @returns Effect containing command text or DiagnosticValidationError.
 * @example Effect.runSync(formatCiAnnotationsEffect([]));
 */
export function formatCiAnnotationsEffect(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticReporterOptions = {},
): Effect.Effect<string, DiagnosticValidationError> {
  return observeDiagnostic(
    "format-annotations",
    Effect.map(toCiAnnotationsEffect(diagnostics, options), (values) =>
      values.map(formatAnnotation).join("\n"),
    ),
  );
}

/** Encodes CI annotations using GitHub Actions portable command format.
 * @param diagnostics - Diagnostics to encode.
 * @param options - Path normalization options.
 * @returns Command text.
 * @throws TypeError for invalid diagnostic fields.
 * @example formatCiAnnotations([]);
 */
export function formatCiAnnotations(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticReporterOptions = {},
): string {
  return runDiagnostic(formatCiAnnotationsEffect(diagnostics, options));
}

function formatAnnotation(annotation: CiAnnotation): string {
  const properties = [
    annotation.file === undefined ? undefined : `file=${escapeCommand(annotation.file)}`,
    annotation.line === undefined ? undefined : `line=${annotation.line}`,
    annotation.column === undefined ? undefined : `col=${annotation.column}`,
    `title=${escapeCommand(annotation.title)}`,
  ]
    .filter((property): property is string => property !== undefined)
    .join(",");
  return `::${annotation.level}${properties ? ` ${properties}` : ""}::${escapeCommand(annotation.message)}`;
}

function escapeCommand(value: string): string {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A")
    .replaceAll(":", "%3A")
    .replaceAll(",", "%2C");
}
