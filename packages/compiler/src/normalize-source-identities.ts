import { encodeErrorId, encodeMemberId, encodeSourceId } from "./discovery/source-id.js";
import { add } from "./normalize-pass-utils.js";
import { id, isRecord, refId } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
const SOURCE_SCOPED_KINDS = new Set([
  "function",
  "route",
  "service",
  "tool",
  "agent",
  "error",
  "middleware",
  "transform",
  "service-middleware",
]);
export function normalizeSourceIdentities(
  work: NormalizationWork,
  descriptors: readonly NormalizedDescriptor[],
): NormalizedDescriptor[] {
  const candidates = descriptors.map(candidate);
  const identities = new Map<string, string>();
  for (const entry of candidates) {
    if (!entry.inferred) continue;
    const resolved = derive(entry.descriptor, work);
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
      continue;
    }
    entry.resolved = resolved;
    identities.set(entry.originalId, resolved);
  }
  addServiceMemberIdentities(candidates, identities);
  addNestedErrorIdentities(candidates, identities);
  return descriptors.map((descriptor, index) => {
    const entry = candidates[index]!;
    const resolved = entry.resolved ?? descriptor.id;
    const rewritten = rewrite(descriptor.value, identities, new Set());
    const value =
      isRecord(rewritten) && entry.resolved !== undefined
        ? {
            ...rewritten,
            id: resolved,
            ref: rewriteRef(rewritten.ref, identities, descriptor.kind, resolved),
          }
        : rewritten;
    return {
      ...descriptor,
      id: resolved,
      identity: entry.inferred ? "inferred" : "explicit",
      value,
      ...(descriptor.reference === undefined
        ? {}
        : { reference: { ...descriptor.reference, descriptorId: resolved } }),
    };
  });
}
interface IdentityCandidate {
  readonly descriptor: NormalizedDescriptor;
  readonly originalId: string;
  readonly inferred: boolean;
  resolved?: string;
}
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
function derive(descriptor: NormalizedDescriptor, work: NormalizationWork): string | undefined {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const fact = descriptor.exportFact;
  if (fact === undefined) return undefined;
  const binding = fact?.binding ?? fact?.factory?.binding;
  if (descriptor.kind === "error" || fact?.errorBinding !== undefined) {
    const errorBinding = fact?.errorBinding?.binding ?? binding;
    return errorBinding === undefined
      ? undefined
      : encodeErrorId(descriptor.source.file, errorBinding, undefined, work.input.projectRoot);
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
  return encodeSourceId({
    kind: descriptor.kind as Parameters<typeof encodeSourceId>[0]["kind"],
    source: descriptor.source.file,
    ...(work.input.projectRoot === undefined ? {} : { projectRoot: work.input.projectRoot }),
    exportName: descriptor.exportName,
    exportKind: descriptor.exportKind,
    ...(binding === undefined ? {} : { binding }),
    ...route,
  });
}
function addServiceMemberIdentities(
  candidates: readonly IdentityCandidate[],
  identities: Map<string, string>,
): void {
  for (const entry of candidates.filter(({ descriptor }) => descriptor.kind === "service")) {
    const serviceId = entry.resolved ?? (entry.inferred ? undefined : entry.descriptor.id);
    if (serviceId === undefined) continue;
    const value = isRecord(entry.descriptor.value) ? entry.descriptor.value : {};
    const functions = isRecord(value.functions) ? value.functions : {};
    for (const [member, target] of Object.entries(functions)) {
      const targetId = id(isRecord(target) ? target.id : refId(target));
      if (targetId === undefined || !targetId.startsWith("unbound.")) continue;
      const memberId = encodeMemberId(serviceId, member);
      if (memberId !== undefined) identities.set(targetId, memberId);
    }
  }
}
function addNestedErrorIdentities(
  candidates: readonly IdentityCandidate[],
  identities: Map<string, string>,
): void {
  for (const { descriptor } of candidates) {
    const bindings = (descriptor.facts?.errorBindings ?? []).filter(
      ({ id: presence }) => presence === "omitted",
    );
    const errors = collect(descriptor.value, "error").filter(({ id }) => id.startsWith("unbound."));
    for (const [index, binding] of bindings.entries()) {
      const error = errors[index];
      const errorId =
        error === undefined ? undefined : encodeErrorId(descriptor.source.file, binding.binding);
      if (error !== undefined && errorId !== undefined) identities.set(error.id, errorId);
    }
  }
}
function collect(value: unknown, kind: string, active = new Set<object>()): Record<string, any>[] {
  if (Array.isArray(value)) {
    if (active.has(value)) return [];
    active.add(value);
    const result = value.flatMap((child) => collect(child, kind, active));
    active.delete(value);
    return result;
  }
  if (!isRecord(value)) return [];
  if (active.has(value)) return [];
  active.add(value);
  const result = value.kind === kind ? [value] : [];
  for (const child of Object.values(value)) result.push(...collect(child, kind, active));
  active.delete(value);
  return result;
}
function rewrite(
  value: unknown,
  identities: ReadonlyMap<string, string>,
  active: Set<object>,
): unknown {
  if (Array.isArray(value)) {
    const result = value.map((entry) => rewrite(entry, identities, active));
    return result.some((entry, index) => entry !== value[index]) ? result : value;
  }
  if (!isRecord(value) || active.has(value)) return value;
  active.add(value);
  let changed = false;
  const result: Record<string, unknown> = { ...value };
  for (const [key, child] of Object.entries(value)) {
    const mapped =
      (key === "id" || key === "transformId" || key === "errorId") && typeof child === "string"
        ? (identities.get(child) ?? child)
        : rewrite(child, identities, active);
    if (mapped !== child) {
      result[key] = mapped;
      changed = true;
    }
  }
  active.delete(value);
  return changed ? result : value;
}
function rewriteRef(
  value: unknown,
  identities: ReadonlyMap<string, string>,
  kind: string,
  fallback: string,
): unknown {
  const ref = rewrite(value, identities, new Set());
  if (!isRecord(ref)) return { kind, id: fallback };
  return { ...ref, kind: typeof ref.kind === "string" ? ref.kind : kind, id: ref.id ?? fallback };
}
