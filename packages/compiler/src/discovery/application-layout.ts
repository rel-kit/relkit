/**
 * Collects service layout evidence from compiler syntax facts without importing
 * application modules. Shared contracts select roots; source normalization and
 * candidate detection remain compiler-owned and preserve typed path failures.
 */
import { selectApplicationLayout } from "@relkit/contracts";
import { Effect } from "effect";
import { observeCompiler } from "../observability.js";
import { runCompilerSync } from "../compatibility.js";
import { prefilterSourcesEffect } from "./ast-prefilter.js";
import type { AstSourceModule } from "./ast-prefilter.types.js";

/**
 * Interprets declarations while leaving helper files opaque to evaluation.
 * @param modules - Complete authored source text, including ordinary helpers.
 * @param projectRoot - Canonical root used for contained path normalization.
 * @returns A lazy layout interpretation; malformed paths fail with SourceLocationError.
 * @remarks No database/auth/model/resource is constructed by syntax inspection.
 */
export const discoverApplicationLayoutEffect = Effect.fn("Discovery.applicationLayout")(
  function* (modules: readonly AstSourceModule[], projectRoot: string) {
    const result = yield* prefilterSourcesEffect(modules, { projectRoot });
    const evidence = result.candidates.flatMap((candidate) =>
      candidate.facts.factoryBindings.map((factory) => ({
        file: candidate.fileName,
        kind: factory.kind,
      })),
    );
    return selectApplicationLayout(projectRoot, evidence);
  },
  (effect, modules) =>
    observeCompiler("discovery", "applicationLayout", effect, () => ({ files: modules.length })),
);

/**
 * Provides the compiler's synchronous discovery seam to scaffolding consumers.
 * @param modules - Authored modules inspected without executing their code.
 * @param projectRoot - Canonical application root.
 * @returns The same immutable layout as effectful compiler discovery.
 * @throws SourceLocationError for invalid or escaping project paths.
 */
export function discoverApplicationLayout(
  modules: readonly AstSourceModule[],
  projectRoot: string,
) {
  return runCompilerSync(discoverApplicationLayoutEffect(modules, projectRoot));
}
