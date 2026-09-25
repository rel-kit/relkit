import { Effect } from "effect";
import { compareDiagnostics, createDiagnosticCore } from "./diagnostic-core.js";
import { DiagnosticValidationError } from "./diagnostic-error.js";
import { observeDiagnostic, runDiagnostic } from "./diagnostic-observability.js";
import type {
  Diagnostic,
  DiagnosticInput,
  DiagnosticNormalizationOptions,
} from "./diagnostic.types.js";

export type {
  Diagnostic,
  DiagnosticInput,
  DiagnosticLocation,
  DiagnosticLocationInput,
  DiagnosticNormalizationOptions,
  DiagnosticSeverity,
} from "./diagnostic.types.js";

/** Creates an immutable diagnostic in an Effect with typed validation failure.
 * @param input - Diagnostic fields and optional compatibility aliases.
 * @param options - Project root for portable paths.
 * @returns Effect containing the diagnostic or DiagnosticValidationError.
 * @example Effect.runSync(createDiagnosticEffect({ code: "X", severity: "error", message: "Bad" }));
 */
export function createDiagnosticEffect(
  input: DiagnosticInput,
  options: DiagnosticNormalizationOptions = {},
): Effect.Effect<Diagnostic, DiagnosticValidationError> {
  return observeDiagnostic(
    "create",
    Effect.try({ try: () => createDiagnosticCore(input, options), catch: validationError }),
  );
}

/** Synchronous compatibility adapter for diagnostic creation.
 * @param input - Diagnostic fields.
 * @param options - Project root for portable paths.
 * @returns Frozen normalized diagnostic.
 * @throws TypeError for invalid diagnostic fields.
 * @example createDiagnostic({ code: "X", severity: "error", message: "Bad" });
 */
export function createDiagnostic(
  input: DiagnosticInput,
  options: DiagnosticNormalizationOptions = {},
): Diagnostic {
  return runDiagnostic(createDiagnosticEffect(input, options));
}

/** Compatibility alias for createDiagnostic.
 * @param input - Diagnostic fields.
 * @param options - Project root for portable paths.
 * @returns Frozen normalized diagnostic.
 * @throws TypeError for invalid input.
 * @example normalizeDiagnostic({ code: "X", severity: "info", message: "Note" });
 */
export const normalizeDiagnostic = createDiagnostic;

/** Normalizes and sorts inputs with typed validation failure.
 * @param diagnostics - Inputs to normalize and sort.
 * @param options - Project root for portable paths.
 * @returns Effect containing sorted diagnostics or DiagnosticValidationError.
 * @example Effect.runSync(sortDiagnosticsEffect([]));
 */
export function sortDiagnosticsEffect(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticNormalizationOptions = {},
): Effect.Effect<readonly Diagnostic[], DiagnosticValidationError> {
  return observeDiagnostic(
    "sort",
    Effect.try({
      try: () =>
        diagnostics
          .map((diagnostic) => createDiagnosticCore(diagnostic, options))
          .sort(compareDiagnostics),
      catch: validationError,
    }),
  );
}

/** Sorts diagnostics by portable source location and stable content.
 * @param diagnostics - Inputs to normalize and sort.
 * @param options - Project root for portable paths.
 * @returns Sorted immutable diagnostics.
 * @throws TypeError for invalid input.
 * @example sortDiagnostics([{ code: "X", severity: "info", message: "Note" }]);
 */
export function sortDiagnostics(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticNormalizationOptions = {},
): readonly Diagnostic[] {
  return runDiagnostic(sortDiagnosticsEffect(diagnostics, options));
}

function validationError(error: unknown): DiagnosticValidationError {
  if (!(error instanceof TypeError)) throw error;
  const field =
    /^Diagnostic (code|message|documentationPath) must/.exec(error.message)?.[1] ??
    (error.message.includes("severity")
      ? "severity"
      : error.message.includes("location")
        ? "location"
        : "input");
  return new DiagnosticValidationError({ field, message: error.message });
}
