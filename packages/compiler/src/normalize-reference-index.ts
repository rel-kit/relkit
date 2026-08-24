import { add } from "./normalize-pass-utils.js";
import { id, isRecord, refId, refKind, source } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

/** Builds deterministic global and kind-qualified indexes for compiler references. */
export function passIndex(work: NormalizationWork): void {
  const descriptors = [...work.descriptors].sort(compareDescriptors);
  for (const descriptor of descriptors) register(work, descriptor, false);

  for (const service of descriptors.filter((entry) => entry.kind === "service")) {
    const value = isRecord(service.value) ? service.value : {};
    const functions = isRecord(value.functions) ? value.functions : {};
    for (const [member, target] of Object.entries(functions)) {
      if (!isRecord(target) || refKind(target) !== "function") continue;
      const nested = nestedDescriptor(target, "function", service, work, member);
      if (nested !== undefined) register(work, nested, true);
    }
  }
}

/** Resolves a reference only when both its ID and kind match the index. */
export function referenceFor(
  work: NormalizationWork,
  value: unknown,
  kind: string,
): NormalizedDescriptor | undefined {
  if (refKind(value) !== kind) return undefined;
  const targetId = refId(value);
  return targetId === undefined ? undefined : work.referencesByKind.get(kind)?.get(targetId);
}

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
  if (previous !== undefined) {
    if (!(nested && previous.value === descriptor.value)) addDuplicate(work, descriptor, previous);
    return;
  }
  work.references.set(descriptor.id, descriptor);
  if (descriptor.kind === "middleware") work.middlewareReferences.set(descriptor.id, descriptor);
  if (descriptor.kind === "transform") work.transformReferences.set(descriptor.id, descriptor);
}

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

function compareDescriptors(left: NormalizedDescriptor, right: NormalizedDescriptor): number {
  return (
    left.id.localeCompare(right.id) ||
    left.kind.localeCompare(right.kind) ||
    left.source.file.localeCompare(right.source.file) ||
    left.source.line - right.source.line ||
    left.source.column - right.source.column
  );
}
