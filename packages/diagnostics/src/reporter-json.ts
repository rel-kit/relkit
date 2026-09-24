import { canonicalJson } from "@relkit/contracts";
import { Effect } from "effect";
import { sortDiagnosticsEffect } from "./diagnostic.js";
import { DiagnosticValidationError } from "./diagnostic-error.js";
import { observeDiagnostic, runDiagnostic } from "./diagnostic-observability.js";
import type { DiagnosticInput } from "./diagnostic.types.js";
import type { DiagnosticReporterOptions } from "./reporter.types.js";

/** Serializes diagnostics in an Effect with canonical key order.
 * @param diagnostics - Diagnostics to serialize.
 * @param options - Path normalization options.
 * @returns Effect containing JSON or DiagnosticValidationError.
 * @example Effect.runSync(serializeDiagnosticsEffect([]));
 */
export function serializeDiagnosticsEffect(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticReporterOptions = {},
): Effect.Effect<string, DiagnosticValidationError> {
  return observeDiagnostic(
    "serialize",
    Effect.map(sortDiagnosticsEffect(diagnostics, options), canonicalJson),
  );
}

/** Serializes diagnostics with recursively sorted object keys.
 * @param diagnostics - Diagnostics to serialize.
 * @param options - Path normalization options.
 * @returns Canonical JSON.
 * @throws TypeError for invalid diagnostic fields.
 * @example serializeDiagnostics([]);
 */
export function serializeDiagnostics(
  diagnostics: readonly DiagnosticInput[],
  options: DiagnosticReporterOptions = {},
): string {
  return runDiagnostic(serializeDiagnosticsEffect(diagnostics, options));
}

/** Compatibility alias for serializeDiagnostics.
 * @param diagnostics - Diagnostics to serialize.
 * @param options - Path normalization options.
 * @returns Canonical JSON.
 * @throws TypeError for invalid diagnostic fields.
 * @example diagnosticsToJson([]);
 */
export const diagnosticsToJson = serializeDiagnostics;
