import { Effect } from "effect";
import { createDiagnosticEffect, sortDiagnosticsEffect } from "./diagnostic.js";
import { DiagnosticValidationError } from "./diagnostic-error.js";
import { observeDiagnostic, runDiagnostic } from "./diagnostic-observability.js";
import { renderDiagnosticEffect, resolveSource } from "./reporter-source.js";
import type { DiagnosticSourceError } from "./reporter-source.js";
import type { DiagnosticInput } from "./diagnostic.types.js";
import type { DiagnosticReporterOptions } from "./reporter.types.js";

/** Formats one diagnostic with typed validation failure.
 * @param input - Diagnostic to format.
 * @param options - Presentation options.
 * @returns Effect containing terminal text, DiagnosticValidationError, or DiagnosticSourceError.
 * @example Effect.runSync(formatDiagnosticEffect({ code: "X", severity: "info", message: "Note" }));
 */
export function formatDiagnosticEffect(
  input: DiagnosticInput,
  options: DiagnosticReporterOptions = {},
): Effect.Effect<string, DiagnosticValidationError | DiagnosticSourceError> {
  return observeDiagnostic(
    "format-one",
    Effect.flatMap(resolveSource(options), (resolved) =>
      Effect.flatMap(createDiagnosticEffect(input, resolved), (value) =>
        renderDiagnosticEffect(value, resolved),
      ),
    ),
  );
}

/** Formats one diagnostic for a deterministic human-readable terminal.
 * @param input - Diagnostic to format.
 * @param options - Presentation options.
 * @returns Terminal text.
 * @throws TypeError for invalid fields or the original source provider error.
 * @example formatDiagnostic({ code: "X", severity: "info", message: "Note" });
 */
export function formatDiagnostic(
  input: DiagnosticInput,
  options: DiagnosticReporterOptions = {},
): string {
  return runDiagnostic(formatDiagnosticEffect(input, options));
}

/** Formats diagnostics in stable source and content order in an Effect.
 * @param diagnostics - Diagnostics to format.
 * @param options - Presentation options.
 * @returns Effect containing terminal text, DiagnosticValidationError, or DiagnosticSourceError.
 * @example Effect.runSync(formatDiagnosticsEffect([]));
 */
export function formatDiagnosticsEffect(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticReporterOptions = {},
): Effect.Effect<string, DiagnosticValidationError | DiagnosticSourceError> {
  return observeDiagnostic(
    "format-many",
    Effect.flatMap(resolveSource(options), (resolved) =>
      Effect.flatMap(sortDiagnosticsEffect(diagnostics, resolved), (values) =>
        Effect.map(
          Effect.forEach(values, (value) => renderDiagnosticEffect(value, resolved), {
            concurrency: 1,
          }),
          (text) => text.join("\n"),
        ),
      ),
    ),
  );
}

/** Formats diagnostics in stable source and content order.
 * @param diagnostics - Diagnostics to format.
 * @param options - Presentation options.
 * @returns Terminal text.
 * @throws TypeError for invalid fields or the original source provider error.
 * @example formatDiagnostics([]);
 */
export function formatDiagnostics(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticReporterOptions = {},
): string {
  return runDiagnostic(formatDiagnosticsEffect(diagnostics, options));
}
