import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";

import { jobCompatibleEffect } from "./normalize-compat.js";
import { add } from "./normalize-pass-utils.js";
import { referenceFor } from "./normalize-reference-index.js";

import { isRecord } from "./normalize-utils.js";
import { validateJobNamesEffect } from "./jobs/names.js";
import { validateJobRequirementsEffect } from "./jobs/diagnostics.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";

/**
 * Checks job identities, legacy invocation compatibility, and provider requirements.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that checks job identities, legacy invocation compatibility, and provider requirements; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passJobsEffect = Effect.fn("Compiler.passJobs")(
  function* (work: NormalizationWork) {
    yield* validateJobNamesEffect(work);
    validateLegacyJobs(work);
    yield* Effect.forEach(
      work.descriptors.filter((entry) => entry.kind === "job"),
      (descriptor) =>
        Effect.gen(function* () {
          const value = descriptor.value as Record<string, any>;
          if (value.task !== undefined) return;
          const target = referenceFor(work, value.target, "function");
          const reason = yield* jobCompatibleEffect(
            value.input,
            isRecord(target?.value) ? target.value.input : undefined,
          );
          if (reason !== undefined) add(work, descriptor, NORMALIZE_CODES.jobInput, reason);
        }),
      { discard: true },
    );
    yield* validateJobRequirementsEffect(work);
  },
  (effect, work) =>
    observeCompiler("normalization", "passJobs", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks job identities, legacy invocation compatibility, and provider requirements.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passJobs(work: NormalizationWork): void {
  return runCompilerSync(passJobsEffect(work));
}

/**
 * Checks the application's explicit legacy job compatibility setting.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function validateLegacyJobs(work: NormalizationWork): void {
  const application = work.descriptors.find((entry) => entry.kind === "app");
  if (application === undefined) return;
  const applicationValue = isRecord(application.value) ? application.value : {};
  const compatibility = isRecord(applicationValue.compatibility)
    ? applicationValue.compatibility
    : {};
  if (compatibility.legacyJobs === true) return;
  for (const job of work.descriptors.filter((entry) => entry.kind === "job")) {
    const value = isRecord(job.value) ? job.value : {};
    if (isRecord(value.task)) continue;
    add(
      work,
      job,
      NORMALIZE_CODES.legacyJobs,
      "Legacy function-target jobs require compatibility.legacyJobs to be enabled.",
      "error",
      undefined,
      "Set defineApp({ compatibility: { legacyJobs: true } }) during the migration window.",
    );
  }
}
