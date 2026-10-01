import { dependencyKind, add } from "./normalize-pass-support.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";

import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
import { isRecord, refId, refKind } from "./normalize-utils.js";

/**
 * Checks descriptor dependency references against the authoritative indexes.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param descriptor - Descriptor whose contract is checked.
 * @param dependencies - Declared dependencies for the validation.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const validateDependenciesEffect = Effect.fn("Compiler.validateDependencies")(
  function* (work: NormalizationWork, descriptor: NormalizedDescriptor, dependencies: unknown) {
    if (!isRecord(dependencies)) return;
    for (const [category, refs] of Object.entries(dependencies)) {
      if (!isRecord(refs)) continue;
      for (const reference of Object.values(refs)) {
        const targetId = refId(reference);
        const targetKind = refKind(reference);
        if (
          targetId === undefined ||
          targetKind !== dependencyKind(category) ||
          work.referencesByKind.get(targetKind)?.has(targetId) !== true
        ) {
          add(
            work,
            descriptor,
            NORMALIZE_CODES.missingTarget,
            `Dependency ${category} does not resolve to a known descriptor.`,
          );
        }
      }
    }
  },
  (effect, work, descriptor, dependencies) =>
    observeCompiler("normalization", "validateDependencies", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks descriptor dependency references against the authoritative indexes.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param descriptor - Descriptor whose contract is checked.
 * @param dependencies - Declared dependencies for the validation.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function validateDependencies(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  dependencies: unknown,
): void {
  return runCompilerSync(validateDependenciesEffect(work, descriptor, dependencies));
}

export {
  toDescriptor,
  isExtracted,
  isDescriptorLike,
  targetFields,
  add,
} from "./normalize-pass-support.js";

export {
  validateRetryEffect,
  validateRetry,
  normalizeRetry,
  normalizeSchedule,
} from "./normalize-policy-validation.js";
