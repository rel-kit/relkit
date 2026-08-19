export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Examples must contain finite JSON values");
    return Object.is(value, -0) ? 0 : value;
  }
  if (value instanceof URL) return value.toString();
  if (Array.isArray(value)) return Object.freeze(value.map(toJsonValue));
  if (typeof value !== "object" || value === undefined) {
    throw new TypeError("Examples must contain JSON-safe values");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Examples must contain plain objects");
  }
  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property || !("value" in property)) {
      throw new TypeError("Examples cannot contain accessors");
    }
    result[key] = toJsonValue(property.value);
  }
  return Object.freeze(result);
}
