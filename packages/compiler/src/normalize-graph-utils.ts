import type { JsonValue } from "@zsys/contracts";

/** Replaces executable/non-JSON fields with deterministic nulls for graph data. */
export function clean(value: unknown): JsonValue {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return null;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(clean);
  if (typeof value === "object") {
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort())
      output[key] = clean((value as Record<string, unknown>)[key]);
    return output;
  }
  return null;
}
