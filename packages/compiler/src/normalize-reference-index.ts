import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { add } from "./normalize-pass-utils.js";
import { id, isRecord, refId, refKind, source } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

/**
 * Builds authoritative descriptor and nested reference indexes.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that builds authoritative descriptor and nested reference indexes; unexpected access failures remain defects.
 */
export const passIndexEffect = Effect.fn("Compiler.passIndex")(
  function* (work: NormalizationWork) {
    const descriptors = [...work.descriptors].sort(compareDescriptors);
    for (const descriptor of descriptors) register(work, descriptor, false);

    for (const service of descriptors.filter((entry) => entry.kind === "service")) {
      const value = isRecord(service.value) ? service.value : {};
      for (const [member, target] of Object.entries(value)) {
        const kind = refKind(target);
        if (
          !isRecord(target) ||
          kind === undefined ||
          !["function", "event", "task", "job"].includes(kind)
        )
          continue;
        const nested = nestedDescriptor(target, kind, service, work, member);
        if (nested !== undefined) register(work, nested, true);
      }
    }
  },
  (effect, work) =>
    observeCompiler("normalization", "passIndex", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Builds authoritative descriptor and nested reference indexes.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passIndex(work: NormalizationWork): void {
  return runCompilerSync(passIndexEffect(work));
}

/**
 * Resolves a reference only when both its ID and kind match the index.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param value - Declared metadata inspected without coercion.
 * @param kind - Descriptor or syntax category.
 * @returns The indexed descriptor matching both ID and kind, or undefined.
 */
export function referenceFor(
  work: NormalizationWork,
  value: unknown,
  kind: string,
): NormalizedDescriptor | undefined {
  if (refKind(value) !== kind) return undefined;
  const targetId = refId(value);
  return targetId === undefined ? undefined : work.referencesByKind.get(kind)?.get(targetId);
}

/**
 * Registers a descriptor while retaining duplicate identity diagnostics.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param nested - Whether this descriptor was discovered inside its parent.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function register(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  nested: boolean,
): void {
  const kindIndex = work.referencesByKind.get(descriptor.kind) ?? new Map();
  const previousKind = kindIndex.get(descriptor.id);
  if (previousKind !== undefined) {
    if (nested && work.descriptors.includes(previousKind)) return;
    if (!(nested && previousKind.value === descriptor.value)) {
      addDuplicate(work, descriptor, previousKind);
    }
    return;
  }
  kindIndex.set(descriptor.id, descriptor);
  work.referencesByKind.set(descriptor.kind, kindIndex);

  const previous = work.references.get(descriptor.id);
  if (previous === undefined || previous.kind === descriptor.kind) {
    if (previous !== undefined) {
      if (!(nested && previous.value === descriptor.value))
        addDuplicate(work, descriptor, previous);
      return;
    }
    work.references.set(descriptor.id, descriptor);
  }
  if (descriptor.kind === "middleware") work.middlewareReferences.set(descriptor.id, descriptor);
  if (descriptor.kind === "transform") work.transformReferences.set(descriptor.id, descriptor);
}

/**
 * Records a duplicate descriptor identity with both source locations.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param previous - Existing descriptor sharing the candidate identity.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function addDuplicate(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  previous: NormalizedDescriptor,
): void {
  const code =
    descriptor.kind === "transform" || previous.kind === "transform"
      ? NORMALIZE_CODES.transformCollision
      : NORMALIZE_CODES.duplicateId;
  const inferred = descriptor.identity === "inferred" || previous.identity === "inferred";
  add(
    work,
    descriptor,
    code,
    inferred
      ? `Source-inferred ${descriptor.kind} ID "${descriptor.id}" collides with another descriptor.`
      : `Duplicate ${descriptor.kind} ID "${descriptor.id}".`,
    "error",
    previous,
    inferred ? "Provide an explicit id to disambiguate the colliding descriptor." : undefined,
  );
}

/**
 * Attaches the parent's provenance to a nested descriptor.
 * @param value - Declared metadata inspected without coercion.
 * @param kind - Descriptor or syntax category.
 * @param parent - Descriptor supplying inherited source provenance.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param exportName - Declared source export name.
 * @returns The nested descriptor with inherited source and execution provenance, or undefined.
 */
function nestedDescriptor(
  value: Record<string, unknown>,
  kind: string,
  parent: NormalizedDescriptor,
  work: NormalizationWork,
  exportName = parent.exportName,
): NormalizedDescriptor | undefined {
  const nestedId = id(value.id ?? refId(value));
  if (nestedId === undefined) return undefined;
  return {
    kind,
    id: nestedId,
    source: source(value.source, work.input, parent.source.file),
    exportName,
    exportKind: parent.exportKind,
    value,
  };
}

/**
 * Orders descriptors by identity and portable source position.
 * @param left - First value to compare.
 * @param right - Second value to compare.
 * @returns The ordering result or precedence rank.
 */
function compareDescriptors(left: NormalizedDescriptor, right: NormalizedDescriptor): number {
  return (
    left.id.localeCompare(right.id) ||
    left.kind.localeCompare(right.kind) ||
    left.source.file.localeCompare(right.source.file) ||
    left.source.line - right.source.line ||
    left.source.column - right.source.column
  );
}
