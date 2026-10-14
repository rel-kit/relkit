/**
 * Combines compiler syntax evidence and evaluated descriptor origins into a
 * shared layout, reports conflicts and checks each evidenced public boundary.
 * Direct descriptor-only normalization remains independent of application files.
 */
import { selectApplicationLayout, type ApplicationLayout } from "@relkit/contracts";
import { createDiagnostic } from "@relkit/diagnostics";
import { Effect } from "effect";
import { observeCompiler } from "./observability.js";
import { discoverApplicationLayoutEffect } from "./discovery/application-layout.js";
import { validateServiceFileEffect, domainDiagnostic } from "./normalize-domain-helpers.js";
import { add } from "./normalize-pass-utils.js";
import { isRecord } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizationWork,
  type NormalizedDescriptor,
} from "./normalize-types.js";

/**
 * Uses compiler evidence for both missing-boundary and evaluated descriptor cases.
 * @param work - Invocation-owned descriptors, project root and diagnostics.
 * @param sources - Normalized source text including ordinary helper modules.
 * @returns A lazy immutable layout; path failures remain typed before validation.
 */
export const normalizationLayoutEffect = Effect.fn("Compiler.normalizationLayout")(
  function* (work: NormalizationWork, sources: ReadonlyMap<string, string>) {
    const root = work.input.projectRoot ?? process.cwd();
    const discovered = yield* discoverApplicationLayoutEffect(
      [...sources].map(([fileName, text]) => ({ fileName, text })),
      root,
    );
    return selectApplicationLayout(root, [
      ...discovered.evidence,
      ...work.descriptors.map((descriptor) => ({
        file: descriptor.source.file,
        kind: descriptor.kind,
      })),
    ]);
  },
  (effect, _work, sources) =>
    observeCompiler("normalization", "normalizationLayout", effect, () => ({
      files: sources.size,
    })),
);

/**
 * Reports structural conflicts and checks the actual boundary source in order.
 * @param work - Invocation-owned normalization diagnostics.
 * @param layout - Shared immutable service roots and structural findings.
 * @param sources - Portable physical source-to-text map.
 * @returns A lazy diagnostic update without application descriptor evaluation.
 */
export const validateLayoutSourcesEffect = Effect.fn("Compiler.validateLayoutSources")(
  function* (
    work: NormalizationWork,
    layout: ApplicationLayout,
    sources: ReadonlyMap<string, string>,
  ) {
    for (const issue of layout.issues)
      work.diagnostics.push(
        createDiagnostic({
          code: issue.code,
          severity: "error",
          message: issue.message,
          location: { file: issue.file, line: 1, column: 1 },
          related: issue.related.map((file) => ({ file, line: 1, column: 1 })),
        }),
      );
    // Mutable compiler diagnostics retain deterministic source order.
    yield* Effect.forEach(
      layout.services,
      (service) => validateServiceFileEffect(work, service.boundary, sources.get(service.boundary)),
      { discard: true },
    );
  },
  (effect, _work, layout) =>
    observeCompiler("normalization", "validateLayoutSources", effect, () => ({
      files: layout.services.length,
    })),
);

/**
 * Requires one service with at least one artifact or a native specialized capability.
 * @param work - Invocation-owned descriptors and diagnostics.
 * @param layout - Evidenced owners, excluding helper-only folders.
 * @param services - Services resolved by logical identity after assignment.
 * @returns Nothing; missing and empty services block activation.
 */
export function validateLayoutCapabilities(
  work: NormalizationWork,
  layout: ApplicationLayout,
  services: ReadonlyMap<string, NormalizedDescriptor>,
): void {
  for (const owner of layout.services) {
    const service = services.get(owner.name);
    if (!service) {
      domainDiagnostic(
        work,
        owner.boundary,
        `Domain "${owner.name}" must export exactly one service.`,
      );
      continue;
    }
    const artifacts = work.descriptors.filter(
      (descriptor) => descriptor.domainId === owner.name && descriptor.kind !== "service",
    );
    const capability = isRecord(service.value) ? service.value.capability : undefined;
    if (artifacts.length === 0 && !isRecord(capability)) {
      add(
        work,
        service,
        NORMALIZE_CODES.domain,
        `Domain "${owner.name}" has no graph-visible artifacts.`,
      );
    }
  }
}
