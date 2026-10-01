import { StableIdError } from "@relkit/contracts";
import { normalizeId } from "@relkit/contracts";

/**
 * Normalizes a model provider and model name selector.
 * @param value - Declared metadata inspected without coercion.
 * @returns A normalized provider/model selector, or undefined.
 */
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

/**
 * Normalizes a primitive stable identifier without coercion.
 * @param value - Declared metadata inspected without coercion.
 * @returns The stable primitive identifier, or undefined without coercion.
 */
function stableId(value: unknown): string | undefined {
  try {
    return normalizeId(value);
  } catch (error) {
    if (!(error instanceof StableIdError)) throw error;
    return undefined;
  }
}
