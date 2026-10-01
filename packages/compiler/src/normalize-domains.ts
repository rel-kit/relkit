import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { validateBoundariesEffect } from "./normalize-boundaries.js";
import {
  assignDomain,
  collectPublicMembers,
  domainDiagnostic,
  domainFor,
  LEGACY_ROOTS,
  sourcePath,
  validateDomainId,
  validateServiceFileEffect,
} from "./normalize-domain-helpers.js";
import { validateDomainServicesAndRoutesEffect } from "./normalize-domain-routes.js";
import { add } from "./normalize-pass-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
import { isRecord, refId } from "./normalize-utils.js";

/**
 * Assigns domain ownership and checks domain exports and dependency boundaries.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const validateDomainsEffect = Effect.fn("Compiler.validateDomains")(
  function* (work: NormalizationWork) {
    const sources = new Map(
      (work.input.sources ?? []).map((source) => [sourcePath(source.fileName, work), source.text]),
    );
    const domains = new Set<string>();
    for (const file of sources.keys()) {
      const domain = domainFor(file);
      if (domain !== undefined) domains.add(domain);
    }
    yield* Effect.forEach(
      [...domains].sort(),
      (domain) =>
        Effect.gen(function* () {
          if (LEGACY_ROOTS.has(domain)) {
            domainDiagnostic(
              work,
              `src/${domain}`,
              `Legacy layer-first root "src/${domain}" must become a domain.`,
            );
          }
          if (!/^[a-z][a-z0-9-]*$/.test(domain)) {
            domainDiagnostic(
              work,
              `src/${domain}`,
              `Domain directory "${domain}" is not a valid domain ID.`,
            );
          }
          yield* validateServiceFileEffect(work, domain, sources.get(`src/${domain}/service.ts`));
        }),
      { discard: true },
    );

    work.descriptors = work.descriptors.map((descriptor) => assignDomain(descriptor));
    const byId = new Map(
      work.descriptors.map((descriptor) => [`${descriptor.kind}:${descriptor.id}`, descriptor]),
    );
    const publicIds = new Set<string>();
    const publicErrorIds = new Set<string>();
    const services = new Map<string, NormalizedDescriptor>();

    for (const descriptor of work.descriptors) {
      if (descriptor.domainId === undefined) continue;
      if (descriptor.kind === "service") {
        const previous = services.get(descriptor.domainId);
        if (previous !== undefined) {
          add(
            work,
            descriptor,
            NORMALIZE_CODES.domain,
            `Domain "${descriptor.domainId}" has multiple services.`,
            "error",
            previous,
          );
        } else services.set(descriptor.domainId, descriptor);
        validateDomainId(work, descriptor);
        collectPublicMembers(work, descriptor, byId, publicIds);
      } else validateDomainId(work, descriptor);
    }

    for (const domain of domains) {
      const service = services.get(domain);
      if (service === undefined) {
        domainDiagnostic(
          work,
          `src/${domain}/service.ts`,
          `Domain "${domain}" must export exactly one service.`,
        );
        continue;
      }
      const artifacts = work.descriptors.filter(
        (descriptor) => descriptor.domainId === domain && descriptor.kind !== "service",
      );
      const capability = isRecord(service.value) ? service.value.capability : undefined;
      if (artifacts.length === 0 && !isRecord(capability)) {
        add(
          work,
          service,
          NORMALIZE_CODES.domain,
          `Domain "${domain}" has no graph-visible artifacts.`,
        );
      }
    }

    for (const descriptor of work.descriptors) {
      if (descriptor.kind !== "function" || !publicIds.has(`function:${descriptor.id}`)) continue;
      const value = isRecord(descriptor.value) ? descriptor.value : {};
      if (Array.isArray(value.errors)) {
        for (const error of value.errors) {
          const errorId = refId(error);
          if (errorId !== undefined) publicErrorIds.add(errorId);
        }
      }
    }
    work.descriptors = work.descriptors.map((descriptor) => ({
      ...descriptor,
      ...(["function", "event", "error"].includes(descriptor.kind)
        ? {
            exposure:
              publicIds.has(`${descriptor.kind}:${descriptor.id}`) ||
              publicErrorIds.has(descriptor.id)
                ? ("public" as const)
                : ("internal" as const),
          }
        : {}),
    }));
    yield* validateDomainServicesAndRoutesEffect(work, sources);
    yield* validateBoundariesEffect(work, sources, services);
  },
  (effect, work) =>
    observeCompiler("normalization", "validateDomains", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Assigns domain ownership and checks domain exports and dependency boundaries.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function validateDomains(work: NormalizationWork): void {
  return runCompilerSync(validateDomainsEffect(work));
}
