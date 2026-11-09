import { Effect } from "effect";
import { observeDiagnostic, runDiagnostic } from "./diagnostic-observability.js";
import { formatCiAnnotationsEffect } from "./reporter-ci.js";
import { formatDiagnosticsEffect } from "./reporter-format.js";
import { serializeDiagnosticsEffect } from "./reporter-json.js";
import type { DiagnosticReporter, DiagnosticReporterOptions } from "./reporter.types.js";

export type {
  CiAnnotation,
  DiagnosticReporter,
  DiagnosticReporterOptions,
} from "./reporter.types.js";

/** Builds a reporter with a shared normalization policy in an Effect.
 * @param options - Path, color, and source settings.
 * @returns Effect containing the frozen reporter; no expected failures.
 * @example Effect.runSync(createDiagnosticReporterEffect({ color: false }));
 */
export function createDiagnosticReporterEffect(
  options: DiagnosticReporterOptions = {},
): Effect.Effect<DiagnosticReporter> {
  return observeDiagnostic(
    "reporter-create",
    Effect.sync(() =>
      Object.freeze({
        text: (diagnostics) => runDiagnostic(formatDiagnosticsEffect(diagnostics, options)),
        json: (diagnostics) => runDiagnostic(serializeDiagnosticsEffect(diagnostics, options)),
        ci: (diagnostics) => runDiagnostic(formatCiAnnotationsEffect(diagnostics, options)),
      } satisfies DiagnosticReporter),
    ),
  );
}

/** Creates compiler, inspector, and CI adapters sharing one normalization policy.
 * @param options - Path, color, and source settings.
 * @returns Frozen reporter with text, JSON, and CI methods.
 * @throws TypeError when a method receives invalid diagnostics.
 * @example createDiagnosticReporter({ color: false }).text([]);
 */
export function createDiagnosticReporter(
  options: DiagnosticReporterOptions = {},
): DiagnosticReporter {
  return runDiagnostic(createDiagnosticReporterEffect(options));
}
