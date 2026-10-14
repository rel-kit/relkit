/**
 * Validates every dependency in an application module using the acquired resolver.
 * Literal static/dynamic edges receive the same policy; computed or unresolved
 * dynamic imports are reported as unproven rather than silently accepted.
 */
import { applicationSourceLayer, type ApplicationLayout } from "@relkit/contracts";
import { createDiagnostic } from "@relkit/diagnostics";
import { Effect } from "effect";
import * as ts from "typescript";
import { SourceResolution } from "./source-resolution.service.js";
import { sourceModuleReferences } from "./source-module-references.js";
import { allowedSourceDependency } from "./normalize-boundary-policy.js";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import type { SourceModuleReference } from "./source-resolution.types.js";
import { observeCompiler } from "./observability.js";

/**
 * Checks source edges without importing a module or activating resources.
 * @param work - Invocation-owned diagnostics and service dependency edges.
 * @param layout - Shared service ownership interpretation.
 * @param source - Parsed module with physical source coordinates.
 * @param services - Service descriptors indexed by logical name.
 * @returns A lazy validation requiring the invocation's SourceResolution service.
 */
export const validateBoundarySourceEffect = Effect.fn("Compiler.validateBoundarySource")(
  function* (
    work: NormalizationWork,
    layout: ApplicationLayout,
    source: ts.SourceFile,
    services: ReadonlyMap<string, NormalizedDescriptor>,
  ) {
    const from = applicationSourceLayer(layout, source.fileName);
    if (from.kind === "tooling" || from.kind === "unowned") return;
    const resolver = yield* SourceResolution;
    for (const reference of sourceModuleReferences(source)) {
      if (reference.specifier === undefined) {
        analysisLimit(work, source, reference);
        continue;
      }
      const resolved = yield* resolver.resolve(source.fileName, reference.specifier);
      if (resolved.kind === "external") continue;
      if (resolved.kind === "unresolved") {
        if (reference.dynamic) analysisLimit(work, source, reference);
        else if (resolved.application) resolutionFailure(work, source, reference);
        continue;
      }
      const target = applicationSourceLayer(layout, resolved.file);
      if (!allowedSourceDependency(from, target, resolved.file)) {
        const suggestion =
          target.kind === "service"
            ? `Use ${target.service.boundary}.`
            : "Move application support to Platform or the owning service.";
        boundaryFailure(work, source, reference, resolved.file, suggestion);
      } else if (
        from.kind === "service" &&
        target.kind === "service" &&
        from.service.name !== target.service.name
      ) {
        const fromService = services.get(from.service.name);
        const toService = services.get(target.service.name);
        if (fromService && toService)
          work.serviceDependencies.push({ from: fromService.id, to: toService.id });
      }
    }
  },
  (effect) => observeCompiler("normalization", "validateBoundarySource", effect),
);

/**
 * Reports an explicit nonfatal dynamic analysis limitation at the expression.
 * @param work - Invocation-owned diagnostics.
 * @param source - Physical importing module.
 * @param reference - Dynamic import expression whose safety cannot be established.
 * @returns Nothing; this warning never certifies the dependency as safe.
 */
function analysisLimit(
  work: NormalizationWork,
  source: ts.SourceFile,
  reference: SourceModuleReference,
): void {
  report(
    work,
    source,
    reference,
    "RELKIT_BOUNDARY_ANALYSIS_LIMIT",
    "warning",
    "Dynamic import boundary cannot be proven statically. Use a resolvable literal or public service boundary.",
  );
}

/**
 * Rejects an unresolved application dependency without blaming external packages.
 * @param work - Invocation-owned diagnostics.
 * @param source - Physical importing module.
 * @param reference - Literal application reference that failed native resolution.
 * @returns Nothing; static application resolution failures block activation.
 */
function resolutionFailure(
  work: NormalizationWork,
  source: ts.SourceFile,
  reference: SourceModuleReference,
): void {
  report(
    work,
    source,
    reference,
    "RELKIT_SOURCE_RESOLUTION",
    "error",
    `Cannot resolve application import "${reference.specifier}". Check its path and project TypeScript aliases.`,
  );
}

/**
 * Rejects a forbidden authored dependency using its actual target filename.
 * @param work - Invocation-owned diagnostics.
 * @param source - Physical importer.
 * @param reference - Source dependency expression.
 * @param target - Resolved physical target, never an identity-projected path.
 * @param suggestion - Permitted boundary or application-layer placement.
 * @returns Nothing; the finding retains the conflicting target location.
 */
function boundaryFailure(
  work: NormalizationWork,
  source: ts.SourceFile,
  reference: SourceModuleReference,
  target: string,
  suggestion: string,
): void {
  const position = source.getLineAndCharacterOfPosition(reference.position);
  work.diagnostics.push(
    createDiagnostic({
      code: "RELKIT_DOMAIN_BOUNDARY",
      severity: "error",
      message: `Import from "${source.fileName}" to "${target}" crosses a domain boundary.`,
      location: { file: source.fileName, line: position.line + 1, column: position.character + 1 },
      suggestion,
      ...(target.startsWith("/") ? {} : { related: [{ file: target, line: 1, column: 1 }] }),
    }),
  );
}

/**
 * Attaches a static-resolution or analysis-limit diagnostic at its real expression.
 * @param work - Invocation-owned diagnostics.
 * @param source - Physical authored module.
 * @param reference - Exact expression offset from the syntax walk.
 * @param code - Fixed diagnostic identity.
 * @param severity - Structural error versus explicit nonfatal analysis limit.
 * @param message - Safe diagnostic explanation without runtime values.
 * @returns Nothing; metadata is appended in source order.
 */
function report(
  work: NormalizationWork,
  source: ts.SourceFile,
  reference: SourceModuleReference,
  code: string,
  severity: "error" | "warning",
  message: string,
): void {
  const position = source.getLineAndCharacterOfPosition(reference.position);
  work.diagnostics.push(
    createDiagnostic({
      code,
      severity,
      message,
      location: { file: source.fileName, line: position.line + 1, column: position.character + 1 },
    }),
  );
}
