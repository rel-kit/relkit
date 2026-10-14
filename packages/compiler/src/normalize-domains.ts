/**
 * Assigns declaration-driven service ownership and validates public membership,
 * capabilities and dependency direction in one observed compiler stage. The shared
 * layout retains physical boundaries while source identity remains grouping-neutral.
 */
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { validateBoundariesEffect } from "./normalize-boundaries.js";
import { assignDomain, sourcePath } from "./normalize-domain-helpers.js";
import { indexDomainMembers, assignDomainExposure } from "./normalize-domain-index.js";
import {
  normalizationLayoutEffect,
  validateLayoutSourcesEffect,
  validateLayoutCapabilities,
} from "./normalize-domain-layout.js";
import { validateDomainServicesAndRoutesEffect } from "./normalize-domain-routes.js";
import type { NormalizationWork } from "./normalize-types.js";

/**
 * Assigns logical service ownership and checks declaration and import boundaries.
 * @param work - Invocation-owned descriptor indexes and diagnostic accumulator.
 * @returns A lazy diagnostic update; syntax/path failures retain their typed channel.
 * @remarks Direct descriptor normalization without source inputs does not require boundaries.
 */
export const validateDomainsEffect = Effect.fn("Compiler.validateDomains")(
  function* (work: NormalizationWork) {
    const sources = new Map(
      (work.input.sources ?? [])
        .map((source) => [sourcePath(source.fileName, work), source.text] as const)
        .filter(([file]) => file !== ""),
    );
    const layout = yield* normalizationLayoutEffect(work, sources);
    const hasSourceEvidence = work.input.sources !== undefined;
    if (hasSourceEvidence) yield* validateLayoutSourcesEffect(work, layout, sources);
    work.descriptors = work.descriptors.map((descriptor) => assignDomain(descriptor, layout));
    const members = indexDomainMembers(work);
    if (hasSourceEvidence) validateLayoutCapabilities(work, layout, members.services);
    assignDomainExposure(work, members.publicIds);
    yield* validateDomainServicesAndRoutesEffect(work, sources);
    yield* validateBoundariesEffect(work, sources, members.services, layout);
  },
  (effect, work) =>
    observeCompiler("normalization", "validateDomains", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Executes service validation at the existing synchronous compatibility boundary.
 * @param work - Invocation-owned normalization state and diagnostics.
 * @returns Nothing; compiler findings update only this invocation's state.
 */
export function validateDomains(work: NormalizationWork): void {
  runCompilerSync(validateDomainsEffect(work));
}
