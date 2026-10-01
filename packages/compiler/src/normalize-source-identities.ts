import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import type { IdentityCandidate } from "./normalize-source-identities.types.js";
import {
  encodeSourceId,
  encodeErrorIdEffect,
  encodeSourceIdEffect,
} from "./discovery/source-id.js";
import { add } from "./normalize-pass-utils.js";
import { isRecord } from "./normalize-utils.js";
import {
  addServiceMemberIdentitiesEffect,
  addNestedErrorIdentitiesEffect,
} from "./normalize-source-identities-members.js";
import { rewriteIdentityRef, rewriteIdentityValues } from "./normalize-identity-rewrite.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
const SOURCE_SCOPED_KINDS = new Set([
  "app",
  "constants",
  "prompt",
  "function",
  "route",
  "service",
  "tool",
  "agent",
  "error",
  "middleware",
  "transform",
]);

/**
 * Resolves source-derived descriptor identities and rewrites their references.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param descriptors - Ordered descriptors to normalize.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const normalizeSourceIdentitiesEffect = Effect.fn("Compiler.normalizeSourceIdentities")(
  function* (work: NormalizationWork, descriptors: readonly NormalizedDescriptor[]) {
    const candidates = descriptors.map(candidate);
    const identities = new Map<string, string>();
    yield* Effect.forEach(
      candidates,
      (entry) =>
        Effect.gen(function* () {
          if (!entry.inferred) return;
          const resolved = yield* deriveEffect(entry.descriptor, work);
          if (resolved === undefined) {
            add(
              work,
              entry.descriptor,
              NORMALIZE_CODES.identityAmbiguous,
              `Cannot infer a stable ${entry.descriptor.kind} ID from this source binding.`,
              "error",
              undefined,
              "Provide an explicit id or export/bind the descriptor in a statically identifiable form.",
            );
            return;
          }
          entry.resolved = resolved;
          identities.set(entry.originalId, resolved);
        }),
      { discard: true },
    );
    yield* addServiceMemberIdentitiesEffect(candidates, identities);
    yield* addNestedErrorIdentitiesEffect(candidates, identities);
    return descriptors.map((descriptor, index) => {
      const entry = candidates[index]!;
      const resolved = entry.resolved ?? descriptor.id;
      const rewritten = rewriteIdentityValues(descriptor.value, identities, new Set());
      const value =
        isRecord(rewritten) && entry.resolved !== undefined
          ? {
              ...rewritten,
              id: resolved,
              ref: rewriteIdentityRef(rewritten.ref, identities, descriptor.kind, resolved),
            }
          : rewritten;
      return {
        ...descriptor,
        id: resolved,
        identity: entry.inferred ? ("inferred" as const) : ("explicit" as const),
        value,
        ...(descriptor.reference === undefined
          ? {}
          : { reference: { ...descriptor.reference, descriptorId: resolved } }),
      };
    });
  },
  (effect, work, descriptors) =>
    observeCompiler("normalization", "normalizeSourceIdentities", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Resolves source-derived descriptor identities and rewrites their references.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param descriptors - Ordered descriptors to normalize.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function normalizeSourceIdentities(
  work: NormalizationWork,
  descriptors: readonly NormalizedDescriptor[],
): NormalizedDescriptor[] {
  return runCompilerSync(normalizeSourceIdentitiesEffect(work, descriptors));
}

/**
 * Marks an identity as explicit or eligible for source inference.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns Identity evidence marked explicit or eligible for source inference.
 */
function candidate(descriptor: NormalizedDescriptor): IdentityCandidate {
  const factory = descriptor.exportFact?.factory;
  const presence = descriptor.exportFact?.errorBinding?.id ?? factory?.id;
  const inferred =
    SOURCE_SCOPED_KINDS.has(descriptor.kind) &&
    (presence === "omitted" ||
      ((presence === undefined || descriptor.kind === "middleware") &&
        descriptor.id.startsWith("unbound.")));
  return { descriptor, originalId: descriptor.id, inferred };
}

/**
 * Selects route, service, error, or export source identity derivation.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that selects route, service, error, or export source identity derivation; unexpected access failures remain defects.
 */
const deriveEffect = Effect.fn("Compiler.derive")(function* (
  descriptor: NormalizedDescriptor,
  work: NormalizationWork,
) {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const fact = descriptor.exportFact;
  if (fact === undefined) return undefined;
  if (descriptor.kind === "app") return work.input.appId;
  const binding = fact?.binding ?? fact?.factory?.binding;
  if (descriptor.kind === "error" || fact?.errorBinding !== undefined) {
    const errorBinding = fact?.errorBinding?.binding ?? binding;
    return errorBinding === undefined
      ? undefined
      : yield* encodeErrorIdEffect(
          descriptor.source.file,
          errorBinding,
          undefined,
          work.input.projectRoot,
        );
  }
  if (!SOURCE_SCOPED_KINDS.has(descriptor.kind) || fact.factory?.idOptional !== true)
    return undefined;
  const route =
    descriptor.kind === "route"
      ? {
          ...(typeof value.method === "string" ? { method: value.method } : {}),
          ...(typeof value.path === "string" ? { path: value.path } : {}),
        }
      : {};
  return yield* encodeSourceIdEffect({
    kind: descriptor.kind as Parameters<typeof encodeSourceId>[0]["kind"],
    source: descriptor.source.file,
    ...(work.input.projectRoot === undefined ? {} : { projectRoot: work.input.projectRoot }),
    exportName: descriptor.exportName,
    exportKind: descriptor.exportKind,
    ...(binding === undefined ? {} : { binding }),
    ...route,
  });
});
