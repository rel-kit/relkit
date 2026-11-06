import { canonicalJson, isJsonValue, type JsonValue } from "relkit/contracts";

export { schemaKey, stableKey, taskSchemaKey } from "./normalize-utils-keys.js";

/**
 * Checks whether metadata is representable as JSON.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when metadata can be canonically serialized as JSON.
 */
export function json(value: unknown): value is JsonValue {
  // Validation walks the value like serialization does but writes no text.
  return isJsonValue(value);
}

/**
 * Renders canonical JSON for deterministic equality and hashing.
 * @param value - Declared metadata inspected without coercion.
 * @returns Canonical JSON text with deterministic object key ordering.
 */
export function canonical(value: unknown): string {
  return canonicalJson(value);
}

/**
 * Copies a JSON value without retaining mutable metadata references.
 * @param value - Declared metadata inspected without coercion.
 * @returns An independent JSON value with no mutable references to the input.
 */
export function cloneJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneJson(child)]));
  }
  return value;
}

export {
  isRecord,
  isDescriptorKindValue,
  isErrorDescriptorLike,
  hasOwn,
  text,
  positive,
  nonNegative,
  stable,
  id,
  method,
  path,
  profile,
  refId,
  refKind,
} from "./normalize-utils-values.js";

export { source, isSourceLocation, locationFor } from "./normalize-utils-source.js";
