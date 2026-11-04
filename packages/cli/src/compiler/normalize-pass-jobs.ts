import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { validateJobNamesEffect } from "./jobs/names.js";
import { validateJobRequirementsEffect } from "./jobs/diagnostics.js";
import type { NormalizationWork } from "./normalize-types.js";

/**
 * Checks job identities, task bindings, and provider requirements.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that checks job identities, task bindings, and provider requirements; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passJobsEffect = Effect.fn("Compiler.passJobs")(
  function* (work: NormalizationWork) {
    yield* validateJobNamesEffect(work);
    yield* validateJobRequirementsEffect(work);
  },
  (effect, work) =>
    observeCompiler("normalization", "passJobs", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks job identities, task bindings, and provider requirements.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passJobs(work: NormalizationWork): void {
  return runCompilerSync(passJobsEffect(work));
}
