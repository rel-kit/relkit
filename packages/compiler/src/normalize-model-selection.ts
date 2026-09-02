import { normalizeId } from "@relkit/contracts";

export function normalizeSelector(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const selector = value.trim();
  const separator = selector.indexOf(":");
  if (separator < 0) return stableId(selector);
  if (separator === 0 || separator !== selector.lastIndexOf(":")) return undefined;
  const profile = stableId(selector.slice(0, separator));
  const model = selector.slice(separator + 1).trim();
  return profile === undefined || model === "" ? undefined : `${profile}:${model}`;
}

function stableId(value: unknown): string | undefined {
  try {
    return normalizeId(value);
  } catch {
    return undefined;
  }
}
