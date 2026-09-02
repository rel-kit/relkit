import { deepFreeze, isStableId, type JsonValue } from "@relkit/contracts";
import type { ProviderScopedValues } from "./provider-registry-types.js";

export const INFRASTRUCTURE_BINDINGS_ENV = "RELKIT_INFRASTRUCTURE_BINDINGS" as const;

/** Reads deployment-provided, non-secret connection outputs from one bounded JSON value. */
export function parseInfrastructureBindingValues(
  value: string | undefined,
): ProviderScopedValues | undefined {
  if (value === undefined) return undefined;
  if (value.length > 1_048_576) throw new TypeError("Infrastructure binding values are too large.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TypeError("Infrastructure binding values are invalid JSON.");
  }
  if (!isRecord(parsed)) throw new TypeError("Infrastructure binding values must be an object.");
  const result: Record<string, Readonly<Record<string, JsonValue>>> = {};
  for (const [bindingId, fields] of Object.entries(parsed).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!isStableId(bindingId) || !isRecord(fields))
      throw new TypeError("Infrastructure binding output identity is invalid.");
    const output: Record<string, JsonValue> = {};
    for (const [field, fieldValue] of Object.entries(fields).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (!isStableId(field) || !isJson(fieldValue))
        throw new TypeError("Infrastructure binding output is invalid.");
      output[field] = fieldValue;
    }
    result[bindingId] = Object.freeze(output);
  }
  return deepFreeze(result);
}

function isJson(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  return isRecord(value) && Object.values(value).every(isJson);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
