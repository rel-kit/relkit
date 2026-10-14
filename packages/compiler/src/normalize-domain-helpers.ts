/**
 * Attaches evidenced service ownership and validates the one public service
 * boundary. Compiler normalization owns diagnostics; source paths remain real
 * project-relative paths even when grouped identity projection removes a segment.
 */
import {
  SourceLocationError,
  normalizeSourcePath,
  serviceSource,
  applicationSourceLayer,
  type ApplicationLayout,
} from "@relkit/contracts";
import { createDiagnostic } from "@relkit/diagnostics";
import * as ts from "typescript";
import { Effect } from "effect";
import { readFactsEffect } from "./discovery/source-facts.js";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

export { collectPublicMembers, validateDomainId } from "./normalize-domain-members.js";

/**
 * Attaches service ownership using the shared declaration-driven interpretation.
 * @param descriptor - Descriptor whose physical source determines ownership.
 * @param layout - Evidenced roots; absence preserves direct descriptor compatibility.
 * @returns The descriptor with logical domain ownership, retaining real provenance.
 */
export function assignDomain(
  descriptor: NormalizedDescriptor,
  layout?: ApplicationLayout,
): NormalizedDescriptor {
  const layer = layout && applicationSourceLayer(layout, descriptor.source.file);
  let domainId = domainFor(descriptor.source.file);
  if (layout) domainId = layer?.kind === "service" ? layer.service.name : undefined;
  return domainId === undefined ? descriptor : { ...descriptor, domainId };
}

/**
 * Checks exactly one constructed/exported service at its physical boundary.
 * @param work - Invocation-owned diagnostics and descriptor state.
 * @param boundary - Actual flat or grouped public service source path.
 * @param text - Unevaluated authored text; missing text is handled by ownership checks.
 * @returns A lazy diagnostic update; unexpected AST defects propagate.
 */
export const validateServiceFileEffect = Effect.fn("Compiler.validateServiceFile")(
  function* (work: NormalizationWork, boundary: string, text: string | undefined) {
    if (text === undefined) return;
    const source = ts.createSourceFile(boundary, text, ts.ScriptTarget.Latest, true);
    const facts = yield* readFactsEffect(source);
    const factories = facts.factoryBindings.filter(({ kind }) => kind === "service");
    const serviceExports = [...facts.exports.values()].filter(
      ({ factory }) => factory?.kind === "service",
    );
    if (factories.length !== 1 || serviceExports.length !== 1 || facts.exports.size !== 1) {
      domainDiagnostic(
        work,
        boundary,
        "Domain service.ts must construct and export exactly one service runtime value.",
      );
    }
  },
  (effect) => observeCompiler("normalization", "validateServiceFile", effect, () => ({ files: 1 })),
);

/**
 * Executes boundary validation for synchronous compiler callers.
 * @param work - Invocation-owned diagnostics and descriptor state.
 * @param boundary - Actual public boundary filename.
 * @param text - Unevaluated source text when present.
 * @returns Nothing; only supplied compiler diagnostics are updated.
 */
export function validateServiceFile(
  work: NormalizationWork,
  boundary: string,
  text: string | undefined,
): void {
  runCompilerSync(validateServiceFileEffect(work, boundary, text));
}

/**
 * Classifies a normalized source's structural service shape.
 * @param file - Authored path with portable or Windows separators.
 * @returns Its logical service name, excluding Routes/Platform/grouping containers.
 */
export function domainFor(file: string): string | undefined {
  return serviceSource(file.replaceAll("\\", "/"))?.name;
}

/**
 * Normalizes compiler input and reports containment failures before classification.
 * @param file - Relative or absolute source path supplied to compilation.
 * @param work - Invocation-owned diagnostics and project-root evidence.
 * @returns A contained portable path; invalid paths receive no owner and a fatal finding.
 */
export function sourcePath(file: string, work: NormalizationWork): string {
  try {
    return normalizeSourcePath(file, work.input.projectRoot);
  } catch (error) {
    if (!(error instanceof SourceLocationError)) throw error;
    domainDiagnostic(work, "relkit.config.ts", `Invalid source path "${file}": ${error.reason}`);
    return "";
  }
}

/**
 * Appends a physical source-scoped service contract diagnostic.
 * @param work - Invocation-owned diagnostic accumulator.
 * @param file - Portable physical source path.
 * @param message - Safe contract explanation and remediation.
 * @returns Nothing; no output is published by this helper.
 */
export function domainDiagnostic(work: NormalizationWork, file: string, message: string): void {
  work.diagnostics.push(
    createDiagnostic({
      code: NORMALIZE_CODES.domain,
      severity: "error",
      message,
      location: { file, line: 1, column: 1 },
    }),
  );
}
