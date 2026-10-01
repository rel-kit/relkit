import { observeCompiler } from "../observability.js";
import { normalizeSourcePathEffect } from "@relkit/contracts";
import { Effect } from "effect";
import { DEFAULT_TOOLING_CONFIG } from "../config-loader-types.js";
import { matchesExcludeEffect, scanSourceEffect } from "./ast-prefilter-utils.js";
import { runDiscoverySync } from "./discovery-sync.js";
import type {
  AstPrefilterCandidate,
  AstPrefilterOptions,
  AstPrefilterResult,
  AstPrefilterSkipped,
  AstSourceModule,
} from "./ast-prefilter.types.js";

export type {
  AstCandidateIndicator,
  AstSourceModule,
  AstReExport,
  AstPrefilterCandidate,
  AstPrefilterSkipped,
  AstPrefilterOptions,
  AstPrefilterResult,
} from "./ast-prefilter.types.js";

/**
 * Finds possible descriptor modules without importing or evaluating their text.
 * @param modules - Source modules to normalize and inspect.
 * @param options - Optional project root and glob exclusion override.
 * @returns A lazy effect yielding filename-ordered candidates and skipped modules.
 * @remarks Path failures remain in the SourceLocationError channel. Syntax scans
 * run sequentially, so their mutable accumulators remain owned by one execution.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { prefilterSourcesEffect } from "./ast-prefilter.js";
 * const candidates = Effect.runSync(prefilterSourcesEffect([], { projectRoot: process.cwd() }));
 * ```
 */
export const prefilterSourcesEffect = Effect.fn("Discovery.prefilterSources")(
  function* (modules: readonly AstSourceModule[], options: AstPrefilterOptions = {}) {
    const excludes = options.exclude ?? DEFAULT_TOOLING_CONFIG.exclude;
    const ordered = yield* Effect.forEach(modules, (module) =>
      Effect.map(normalizeSourcePathEffect(module.fileName, options.projectRoot), (fileName) => ({
        fileName,
        text: module.text,
      })),
    );
    ordered.sort((left, right) => left.fileName.localeCompare(right.fileName));
    const candidates: AstPrefilterCandidate[] = [];
    const skipped: AstPrefilterSkipped[] = [];
    yield* Effect.forEach(
      ordered,
      (module) =>
        Effect.gen(function* () {
          if (yield* matchesExcludeEffect(module.fileName, excludes)) {
            skipped.push({ fileName: module.fileName, reason: "excluded" });
            return;
          }
          const facts = yield* scanSourceEffect(module.fileName, module.text);
          if (facts.indicators.length === 0) {
            skipped.push({ fileName: module.fileName, reason: "no-candidate-indicator" });
          } else {
            candidates.push(facts);
          }
        }),
      { discard: true },
    );
    return Object.freeze({
      candidates: Object.freeze(candidates),
      skipped: Object.freeze(skipped),
    }) satisfies AstPrefilterResult;
  },
  (effect, modules, options: AstPrefilterOptions = {}) =>
    observeCompiler(
      "discovery",
      "prefilterSources",
      effect,
      () => ({ files: modules.length }),
      true,
    ),
);

/**
 * Runs source candidate discovery for synchronous compiler callers.
 * @param modules - Source modules to normalize and inspect.
 * @param options - Optional project root and glob exclusion override.
 * @returns Filename-ordered candidates and skipped modules.
 * @throws SourceLocationError when a filename or project root is invalid.
 */
export function prefilterSources(
  modules: readonly AstSourceModule[],
  options: AstPrefilterOptions = {},
): AstPrefilterResult {
  return runDiscoverySync(prefilterSourcesEffect(modules, options));
}
