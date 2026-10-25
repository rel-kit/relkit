/** Selects the structural JSON-schema subset that can use provider enforcement without making optional fields required. */
import type { JsonSchema } from "@relkit/schema";
import type { JsonValue } from "@relkit/contracts";

const keywords = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "anyOf",
  "enum",
  "const",
  "title",
  "description",
]);
const types = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);

/** Closes declared objects for native generation; runtime validation still uses the authored schema.
 * @param schema - JSON schema projection; never mutated.
 * @param depth - Current schema nesting, bounded conservatively.
 * @returns A provider-enforceable schema, or undefined to preserve the existing non-strict strategy.
 * @remarks shortcut: only structural keywords are certified; extend with provider tests when other constraints need strict generation. */
export function strictResponseSchema(schema: JsonSchema, depth = 0): JsonSchema | undefined {
  if (depth > 5 || Object.keys(schema).some((key) => !keywords.has(key))) return undefined;
  if (Array.isArray(schema.anyOf)) {
    const anyOf = schema.anyOf.map((member) =>
      isSchema(member) ? strictResponseSchema(member, depth + 1) : undefined,
    );
    if (anyOf.some((member) => member === undefined)) return undefined;
    return { ...schema, anyOf: anyOf.filter((member) => member !== undefined) };
  }
  if (typeof schema.type !== "string" || !types.has(schema.type)) return undefined;
  if (schema.type === "object") return strictObject(schema, depth);
  if (schema.type === "array") {
    if (!isSchema(schema.items)) return undefined;
    const items = strictResponseSchema(schema.items, depth + 1);
    return items === undefined ? undefined : { ...schema, items };
  }
  return schema;
}

/** @param schema - Object projection. @param depth - Schema nesting. @returns A closed object only when every declared field is required. */
function strictObject(schema: JsonSchema, depth: number): JsonSchema | undefined {
  if (
    !isSchema(schema.properties) ||
    (schema.additionalProperties !== undefined && schema.additionalProperties !== false)
  )
    return undefined;
  const keys = Object.keys(schema.properties);
  const required = schema.required;
  if (
    !Array.isArray(required) ||
    required.length !== keys.length ||
    keys.some((key) => !required.includes(key))
  )
    return undefined;
  const properties: Record<string, JsonValue> = {};
  for (const key of keys) {
    const value = schema.properties[key];
    if (!isSchema(value)) return undefined;
    const child = strictResponseSchema(value, depth + 1);
    if (child === undefined) return undefined;
    properties[key] = child;
  }
  return { ...schema, properties, additionalProperties: false };
}

/** @param value - Projected JSON value. @returns Whether the value is a schema object. */
function isSchema(value: JsonValue | undefined): value is JsonSchema {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
