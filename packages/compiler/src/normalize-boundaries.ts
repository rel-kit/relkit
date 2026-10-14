/**
 * Checks ordinary helpers and descriptors against one shared service layout.
 * The invocation owns its TypeScript resolution Layer; deterministic diagnostics
 * and logical dependency edges are retained without evaluating imported modules.
 */
import { selectApplicationLayout, type ApplicationLayout } from "@relkit/contracts";
import { Effect } from "effect";
import { createDiagnostic } from "@relkit/diagnostics";
import * as ts from "typescript";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { sourceResolutionLayer } from "./source-resolution.service.js";
import { validateBoundarySourceEffect } from "./normalize-boundary-source.js";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";

/**
 * Checks all authored source edges using effective TypeScript module resolution.
 * @param work - Invocation-owned diagnostics and dependency index.
 * @param sources - Real portable filenames with unevaluated source text.
 * @param services - Service descriptors indexed by logical service name.
 * @param selected - Shared compiler layout; optional for existing compatibility callers.
 * @returns A lazy diagnostic update; resolver acquisition failure blocks activation.
 */
export const validateBoundariesEffect = Effect.fn("Compiler.validateBoundaries")(
  function* (
    work: NormalizationWork,
    sources: ReadonlyMap<string, string>,
    services: ReadonlyMap<string, NormalizedDescriptor>,
    selected?: ApplicationLayout,
  ) {
    const root = work.input.projectRoot ?? process.cwd();
    const layout =
      selected ??
      selectApplicationLayout(
        root,
        [...services.values()].map((service) => ({
          file: service.source.file,
          kind: service.kind,
        })),
      );
    const validation = Effect.forEach(
      [...sources],
      ([file, text]) =>
        validateBoundarySourceEffect(
          work,
          layout,
          ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true),
          services,
        ),
      { discard: true },
    );
    yield* validation.pipe(
      Effect.provide(sourceResolutionLayer({ root, sources })),
      Effect.catchTag("Compiler.SourceResolutionError", (error) =>
        Effect.sync(() => {
          work.diagnostics.push(
            createDiagnostic({
              code: "RELKIT_SOURCE_RESOLUTION",
              severity: "error",
              message: error.reason,
              location: { file: "tsconfig.json", line: 1, column: 1 },
            }),
          );
        }),
      ),
    );
    work.serviceDependencies = [
      ...new Map(
        work.serviceDependencies.map((edge) => [`${edge.from}\0${edge.to}`, edge]),
      ).values(),
    ].sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
  },
  (effect, work) =>
    observeCompiler("normalization", "validateBoundaries", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Runs boundary validation at the existing synchronous compiler seam.
 * @param work - Invocation-owned diagnostics and dependency index.
 * @param sources - Physical authored source-to-text map.
 * @param services - Logical service descriptor index.
 * @param layout - Shared layout interpretation when supplied by compiler normalization.
 * @returns Nothing; only the supplied invocation's diagnostics/edges are updated.
 */
export function validateBoundaries(
  work: NormalizationWork,
  sources: ReadonlyMap<string, string>,
  services: ReadonlyMap<string, NormalizedDescriptor>,
  layout?: ApplicationLayout,
): void {
  runCompilerSync(validateBoundariesEffect(work, sources, services, layout));
}
