import type { GraphCompilationFailure } from "./normalize-graph.types.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { buildGraphEffect } from "./normalize-graph.js";

import { validateHttpCompatibilityEffect } from "./normalize-http-validation.js";
import { validateEventCompatibilityEffect } from "./normalize-event-validation.js";

import { type NormalizationWork } from "./normalize-types.js";

/**
 * Checks HTTP request and response compatibility.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that checks HTTP request and response compatibility; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passRoutesEffect = Effect.fn("Compiler.passRoutes")(
  function* (work: NormalizationWork) {
    yield* validateHttpCompatibilityEffect(work);
  },
  (effect, work) =>
    observeCompiler("normalization", "passRoutes", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks HTTP request and response compatibility.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passRoutes(work: NormalizationWork): void {
  return runCompilerSync(passRoutesEffect(work));
}

/**
 * Checks event publishers, consumers, and trigger contracts.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that checks event publishers, consumers, and trigger contracts; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passEventsEffect = Effect.fn("Compiler.passEvents")(
  function* (work: NormalizationWork) {
    yield* validateEventCompatibilityEffect(work);
  },
  (effect, work) =>
    observeCompiler("normalization", "passEvents", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks event publishers, consumers, and trigger contracts.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passEvents(work: NormalizationWork): void {
  return runCompilerSync(passEventsEffect(work));
}

/**
 * Retains the ordered event-target stage reserved by the compiler pipeline.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that retains the ordered event-target stage reserved by the compiler pipeline; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passEventTargetsEffect = Effect.fn("Compiler.passEventTargets")(
  function* (work: NormalizationWork) {
    return;
  },
  (effect, work) =>
    observeCompiler("normalization", "passEventTargets", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Retains the ordered event-target stage reserved by the compiler pipeline.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passEventTargets(work: NormalizationWork): void {
  return runCompilerSync(passEventTargetsEffect(work));
}

/**
 * Builds the normalized graph after semantic validation.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that builds the normalized graph after semantic validation; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passGraphEffect: (
  work: NormalizationWork,
) => Effect.Effect<void, GraphCompilationFailure> = Effect.fn("Compiler.passGraph")(
  function* (work: NormalizationWork): Effect.fn.Return<void, GraphCompilationFailure> {
    work.graph = yield* buildGraphEffect(work);
  },
  (effect, work) =>
    observeCompiler("normalization", "passGraph", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Builds the normalized graph after semantic validation.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passGraph(work: NormalizationWork): void {
  return runCompilerSync(passGraphEffect(work));
}

export { passJobsEffect, passJobs } from "./normalize-pass-jobs.js";

export {
  passToolsEffect,
  passTools,
  passAgentsEffect,
  passAgents,
} from "./normalize-pass-agents.js";

export { passCollisionsEffect, passCollisions } from "./normalize-pass-collisions.js";
