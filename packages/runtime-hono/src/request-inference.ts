import { getJsonSchema, type JsonSchema, type StandardSchemaV1 } from "@relkit/schema";

const schemaCache = new WeakMap<object, JsonSchema | null>();
const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

export function decodeInferredInput(value: unknown, route: unknown, target: unknown): unknown {
  if (!isRecord(route) || route.request !== undefined) return value;
  if (!isRecord(target) || !isSchema(target.input)) return value;
  const schema = projectedSchema(target.input);
  return schema === undefined ? value : decodeValue(value, schema);
}

function projectedSchema(schema: StandardSchemaV1): JsonSchema | undefined {
  const cached = schemaCache.get(schema);
  if (cached !== undefined) return cached ?? undefined;
  const result = getJsonSchema(schema);
  const projected = result.ok ? result.schema : null;
  schemaCache.set(schema, projected);
  return projected ?? undefined;
}

function decodeValue(value: unknown, schema: unknown): unknown {
  if (!isRecord(schema)) return value;
  const variants = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf)
      ? schema.oneOf
      : undefined;
  if (variants !== undefined) {
    if (variants.some((variant) => acceptsType(value, variant))) return value;
    for (const variant of variants) {
      const decoded = decodeValue(value, variant);
      if (decoded !== value) return decoded;
    }
    return value;
  }
  const properties = schema.properties;
  if (schema.type === "object" && isRecord(value) && isRecord(properties)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, decodeValue(entry, properties[key])]),
    );
  }
  if (schema.type === "array" && Array.isArray(value)) {
    return value.map((entry) => decodeValue(entry, schema.items));
  }
  if (typeof value !== "string") return value;
  const expected = schema.type ?? typeof schema.const;
  if ((expected === "number" || expected === "integer") && JSON_NUMBER.test(value)) {
    const decoded = Number(value);
    if (Number.isFinite(decoded) && (expected !== "integer" || Number.isInteger(decoded)))
      return decoded;
  }
  if (expected === "boolean" && (value === "true" || value === "false")) return value === "true";
  return value;
}

function acceptsType(value: unknown, schema: unknown): boolean {
  if (!isRecord(schema)) return false;
  if (schema.type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (schema.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (schema.type === "array") return Array.isArray(value);
  if (schema.type === "object") return isRecord(value);
  return typeof schema.type === "string" && typeof value === schema.type;
}

function isSchema(value: unknown): value is StandardSchemaV1 {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
