import { isRecord } from "./normalize-utils.js";

export function rewriteIdentityValues(
  value: unknown,
  identities: ReadonlyMap<string, string>,
  active: Set<object>,
): unknown {
  if (Array.isArray(value)) {
    const result = value.map((entry) => rewriteIdentityValues(entry, identities, active));
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
