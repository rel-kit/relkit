import { Context, Data, Effect, Layer, Option } from "effect";
import { renderDiagnostic } from "./reporter-render.js";
import type { Diagnostic } from "./diagnostic.types.js";
import type { DiagnosticReporterOptions } from "./reporter.types.js";
import type { DiagnosticSourceService } from "./reporter-source.types.js";

export type { DiagnosticSourceService } from "./reporter-source.types.js";

/** Substitutable source text service for excerpts.
 * @example Effect.provide(formatDiagnosticEffect(input), DiagnosticSourceLive);
 */
export class DiagnosticSource extends Context.Service<DiagnosticSource, DiagnosticSourceService>()(
  "relkit/diagnostics/DiagnosticSource",
) {}

/** Expected source provider failure while formatting an excerpt.
 * The synchronous adapter rethrows the original provider error.
 * @example new DiagnosticSourceError({ file: "src/a.ts", cause: new Error("unavailable"), message: "Diagnostic source read failed" });
 */
export class DiagnosticSourceError extends Data.TaggedError("DiagnosticSourceError")<{
  readonly file: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

/** Default source Layer with no filesystem access.
 * @example Effect.provide(formatDiagnosticEffect(input), DiagnosticSourceLive);
 */
export const DiagnosticSourceLive = Layer.succeed(DiagnosticSource, { read: () => undefined });

/** Resolves the Layer source provider or compatibility callback.
 * @param options - Reporter options with optional source callback.
 * @returns Effect containing options with the selected provider.
 * @example Effect.runSync(resolveSource({}));
 */
export function resolveSource(
  options: DiagnosticReporterOptions,
): Effect.Effect<DiagnosticReporterOptions> {
  return Effect.map(Effect.serviceOption(DiagnosticSource), (source) =>
    Option.isSome(source) ? { ...options, source: source.value.read } : options,
  );
}

/** Renders a normalized diagnostic with typed provider failures.
 * Source reads remain sequential to preserve callback order.
 * @param diagnostic - Normalized diagnostic.
 * @param options - Resolved presentation options.
 * @returns Effect containing text or DiagnosticSourceError.
 * @example Effect.runSync(renderDiagnosticEffect(diagnostic, {}));
 */
export function renderDiagnosticEffect(
  diagnostic: Diagnostic,
  options: DiagnosticReporterOptions,
): Effect.Effect<string, DiagnosticSourceError> {
  const files = [
    ...(diagnostic.file && diagnostic.line !== undefined && diagnostic.column !== undefined
      ? [diagnostic.file]
      : []),
    ...(diagnostic.related ?? []).map((related) => related.file),
  ];
  return Effect.map(
    Effect.forEach(
      files,
      (file) =>
        Effect.try({
          try: () => options.source?.(file),
          catch: (cause) =>
            new DiagnosticSourceError({ file, cause, message: "Diagnostic source read failed" }),
        }),
      { concurrency: 1 },
    ),
    (sources) => {
      let index = 0;
      return renderDiagnostic(diagnostic, { ...options, source: () => sources[index++] });
    },
  );
}
