import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { add, targetFields, validateDependenciesEffect } from "./normalize-pass-utils.js";
import { referenceFor } from "./normalize-reference-index.js";
import { id, isRecord, refKind } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
import { validateRateLimitStoreEffect } from "./normalize-rate-limit.js";

/**
 * Checks graph-visible references against the authoritative indexes.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that checks graph-visible references against the authoritative indexes; unexpected access failures remain defects.
 */
export const passReferencesEffect = Effect.fn("Compiler.passReferences")(
  function* (work: NormalizationWork) {
    yield* Effect.forEach(
      work.descriptors,
      (descriptor) =>
        Effect.gen(function* () {
          const value = isRecord(descriptor.value) ? descriptor.value : {};
          const fields =
            descriptor.kind === "job" && isRecord(value.task) ? [] : targetFields(descriptor.kind);
          for (const [name, kind] of fields) {
            if (descriptor.kind === "route" && value.raw === true) continue;
            if (referenceFor(work, value[name], kind) === undefined) {
              add(
                work,
                descriptor,
                NORMALIZE_CODES.missingTarget,
                `${descriptor.kind} target ${name} does not resolve to a ${kind}.`,
              );
            }
            if (kind === "function" && descriptor.kind !== "event-trigger") {
              rejectEventOnlyTarget(work, descriptor, value[name]);
            }
          }
          if (descriptor.kind === "function" || descriptor.kind === "task") {
            yield* validateDependenciesEffect(work, descriptor, value.dependencies);
          }
          if (descriptor.kind === "agent") validateAgentBackend(work, descriptor, value.backend);
          if (descriptor.kind === "route") {
            collectTransforms(work, descriptor, value.request);
            yield* validateRateLimitStoreEffect(work, descriptor, value.rateLimit);
          }
          if (descriptor.kind === "service") validateService(work, descriptor, value);
        }),
      { discard: true },
    );

    for (const descriptor of work.descriptors.filter((entry) => entry.kind === "transform")) {
      if (!work.transformReferences.has(descriptor.id)) {
        add(work, descriptor, NORMALIZE_CODES.missingTransform, "Named transform is not indexed.");
      }
    }
  },
  (effect, work) =>
    observeCompiler("normalization", "passReferences", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks graph-visible references against the authoritative indexes.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passReferences(work: NormalizationWork): void {
  return runCompilerSync(passReferencesEffect(work));
}

/**
 * Checks the referenced agent backend and supported backend metadata.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param agent - Agent descriptor whose executable dependencies are inspected.
 * @param backend - Declared agent backend reference.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function validateAgentBackend(
  work: NormalizationWork,
  agent: NormalizedDescriptor,
  backend: unknown,
): void {
  const kind = refKind(backend);
  if (kind === undefined) return;
  if (kind !== "bucket" || referenceFor(work, backend, "bucket") === undefined) {
    add(
      work,
      agent,
      NORMALIZE_CODES.missingTarget,
      "Agent backend descriptor must resolve to a bucket.",
    );
  }
}

/**
 * Checks a service's public function and event references.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param service - Service descriptor whose public member references are inspected.
 * @param value - Declared metadata inspected without coercion.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function validateService(
  work: NormalizationWork,
  service: NormalizedDescriptor,
  value: Record<string, unknown>,
): void {
  for (const target of Object.values(value)) {
    const kind = refKind(target);
    if (kind === "function" || kind === "event" || kind === "task" || kind === "job") {
      const resolved = referenceFor(work, target, kind);
      if (resolved === undefined) {
        add(
          work,
          service,
          NORMALIZE_CODES.missingTarget,
          `Service member does not resolve to a ${kind}.`,
        );
      }
      if (kind === "function") rejectEventOnlyTarget(work, service, target);
    }
  }
}

/**
 * Rejects event-only functions used by ordinary invocation targets.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param owner - Descriptor owning the nested contract.
 * @param reference - Executable source reference carrying module and export provenance.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function rejectEventOnlyTarget(
  work: NormalizationWork,
  owner: NormalizedDescriptor,
  reference: unknown,
): void {
  const target = referenceFor(work, reference, "function");
  const value = isRecord(target?.value) ? target.value : {};
  if (value.invocationMode !== "event-only") return;
  add(
    work,
    owner,
    NORMALIZE_CODES.eventOnlyTarget,
    `${owner.kind} "${owner.id}" cannot target event-only function "${target?.id}".`,
    "error",
    target,
    "Target a callable defineFunction instead.",
  );
}

/**
 * Collects nested transform descriptors without losing ownership evidence.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param owner - Descriptor owning the nested contract.
 * @param value - Declared metadata inspected without coercion.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function collectTransforms(
  work: NormalizationWork,
  owner: NormalizedDescriptor,
  value: unknown,
): void {
  if (!isRecord(value)) return;
  if (value.kind === "transform") {
    const transformId = id(value.transformId);
    if (transformId === undefined || !work.transformReferences.has(transformId)) {
      add(
        work,
        owner,
        NORMALIZE_CODES.missingTransform,
        `Request transform "${String(value.transformId)}" is missing.`,
      );
    }
    collectTransforms(work, owner, value.value);
    return;
  }
  if (value.kind === "input" || value.kind === "nested") {
    if (isRecord(value.fields)) {
      for (const field of Object.values(value.fields)) collectTransforms(work, owner, field);
    }
    return;
  }
  if (value.kind === "optional" || value.kind === "default")
    collectTransforms(work, owner, value.value);
}
