/**
 * Better Auth describes optional values with the OpenAPI 3.0 keyword `nullable: true`. RelKit's
 * document is OpenAPI 3.1, where that keyword does not exist: a validator reads `type: "string"`
 * and rejects the `null` the server sends (`user.image` of a new account). This converts the 3.0
 * form to the 3.1 form, `type: ["string", "null"]`.
 */
import type { JsonValue } from "relkit/contracts";

type JsonObject = { [key: string]: JsonValue };

/** Keys whose values are data, not schemas, and are never rewritten. */
const DATA_KEYS = new Set(["example", "examples", "default", "enum", "const"]);

/**
 * Rewrites every `nullable` keyword in a JSON document to its OpenAPI 3.1 equivalent.
 * @param value - Detached document subtree.
 * @returns A copy in which `nullable: true` has become a `null` member of `type`, or an `anyOf`
 * with a `null` branch beside a `$ref`, and `nullable: false` is dropped.
 * @example nullableToType({ type: "string", nullable: true }); // { type: ["string", "null"] }
 */
export function nullableToType(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(nullableToType);
  if (!isRecord(value)) return value;
  const copy: JsonObject = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      DATA_KEYS.has(key) ? entry : nullableToType(entry),
    ]),
  );
  if (typeof copy.nullable !== "boolean") return copy;
  const { nullable, ...schema } = copy;
  return nullable ? allowNull(schema) : schema;
}

/** Adds `null` to what a schema accepts. */
function allowNull(schema: JsonObject): JsonObject {
  const { type, $ref, enum: values } = schema;
  if (typeof type === "string") return { ...schema, type: [type, "null"], ...withNull(values) };
  if (Array.isArray(type))
    return {
      ...schema,
      type: type.includes("null") ? type : [...type, "null"],
      ...withNull(values),
    };
  if (typeof $ref === "string") {
    const { $ref: _reference, ...rest } = schema;
    return { ...rest, anyOf: [{ $ref }, { type: "null" }] };
  }
  return { ...schema, ...withNull(values) };
}

/** The `enum` that also lists `null`, when there is one. */
function withNull(values: JsonValue | undefined): JsonObject {
  return Array.isArray(values) && !values.includes(null) ? { enum: [...values, null] } : {};
}

/** Recognizes JSON objects before reading their properties. */
function isRecord(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
