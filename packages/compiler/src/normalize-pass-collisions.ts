import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";

import { add } from "./normalize-pass-utils.js";

import { routeCollisionKeys } from "./normalize-http-validation.js";

import { isRecord } from "./normalize-utils.js";

import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

/**
 * Checks route collisions and generated namespace conflicts.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that checks route collisions and generated namespace conflicts; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passCollisionsEffect = Effect.fn("Compiler.passCollisions")(
  function* (work: NormalizationWork) {
    const routes = new Map<string, NormalizedDescriptor>();
    const descriptors = work.descriptors
      .filter((entry) => entry.kind === "route")
      .sort(compareDescriptors);
    for (const descriptor of descriptors) {
      const value = descriptor.value as Record<string, any>;
      for (const key of routeCollisionKeys(value)) {
        const previous = routes.get(key);
        if (previous === undefined) routes.set(key, descriptor);
        else if (previous.id !== descriptor.id)
          add(
            work,
            descriptor,
            NORMALIZE_CODES.collision,
            `Route collides with "${previous.id}" at ${key}.`,
            "error",
            previous,
          );
      }
    }
    if (hasPublicTaskJobs(work)) {
      for (const descriptor of descriptors) {
        if (descriptor.id !== "jobs") continue;
        add(
          work,
          descriptor,
          NORMALIZE_CODES.collision,
          'Route selector "jobs" collides with the generated client jobs namespace.',
          "error",
        );
      }
    }
  },
  (effect, work) =>
    observeCompiler("normalization", "passCollisions", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks route collisions and generated namespace conflicts.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passCollisions(work: NormalizationWork): void {
  return runCompilerSync(passCollisionsEffect(work));
}

/**
 * Checks whether task-backed jobs expose generated client operations.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns True when at least one task-backed job is publicly exposed.
 */
export function hasPublicTaskJobs(work: NormalizationWork): boolean {
  return work.descriptors.some((descriptor) => {
    if (descriptor.kind !== "job") return false;
    const value = isRecord(descriptor.value) ? descriptor.value : {};
    const client = isRecord(value.client) ? value.client : undefined;
    return (
      isRecord(value.task) && Array.isArray(client?.operations) && client.operations.length > 0
    );
  });
}

/**
 * Orders descriptors by identity and portable source position.
 * @param left - First value to compare.
 * @param right - Second value to compare.
 * @returns The ordering result or precedence rank.
 */
export function compareDescriptors(
  left: NormalizedDescriptor,
  right: NormalizedDescriptor,
): number {
  return (
    left.id.localeCompare(right.id) ||
    left.source.file.localeCompare(right.source.file) ||
    left.source.line - right.source.line ||
    left.source.column - right.source.column
  );
}
