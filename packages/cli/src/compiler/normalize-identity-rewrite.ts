import { isRecord } from "./normalize-utils.js";

/**
 * Rewrites nested descriptor identities while retaining cyclic references.
 * @param value - Declared metadata inspected without coercion.
 * @param identities - Original descriptor identities mapped to their stable replacements.
 * @param active - Ancestor identities owned by the current recursive branch.
 * @returns Rewritten metadata retaining cycles and reference kinds.
 */
export function rewriteIdentityValues(
  value: unknown,
  identities: ReadonlyMap<string, string>,
  active: Set<object>,
): unknown {
  if (typeof value === "object" && value !== null && active.has(value)) return value;
  if (Array.isArray(value)) {
    active.add(value);
    const result = value.map((entry) => rewriteIdentityValues(entry, identities, active));
    active.delete(value);
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
        : rewriteIdentityValues(child, identities, active);
    if (mapped !== child) {
      result[key] = mapped;
      changed = true;
    }
  }
  active.delete(value);
  return changed ? result : value;
}

/**
 * Rewrites a reference while retaining its kind and fallback identity.
 * @param value - Declared metadata inspected without coercion.
 * @param identities - Original descriptor identities mapped to their stable replacements.
 * @param kind - Descriptor or syntax category.
 * @param fallback - Value retained when metadata is absent.
 * @returns The identity-rewritten reference, retaining kind and fallback values.
 */
export function rewriteIdentityRef(
  value: unknown,
  identities: ReadonlyMap<string, string>,
  kind: string,
  fallback: string,
): unknown {
  const ref = rewriteIdentityValues(value, identities, new Set());
  if (!isRecord(ref)) return { kind, id: fallback };
  return { ...ref, kind: typeof ref.kind === "string" ? ref.kind : kind, id: ref.id ?? fallback };
}
