import { getJsonSchema, type JsonSchema, type StandardSchemaV1 } from "@relkit/schema";

const schemaCache = new WeakMap<object, JsonSchema | null>();
const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/** Decode inferred request strings using the target input's JSON Schema.
 * @param value - Value to validate or project.
 * @param route - Route descriptor controlling request mapping.
 * @param target - Target descriptor or validated request source.
 * @returns Converted numbers/booleans, while explicit request mappings remain unchanged.
 * @example
 * import { z } from "@relkit/schema";
 * const target = { input: z.object({ page: z.number(), active: z.boolean() }) };
 * const input = decodeInferredInput({ page: "2", active: "true" }, {}, target);
 * // input is { page: 2, active: true }.
 */
export function decodeInferredInput(value: unknown, route: unknown, target: unknown): unknown {
  if (!isRecord(route) || route.request !== undefined) return value;
  if (!isRecord(target) || !isSchema(target.input)) return value;
  const schema = projectedSchema(target.input);
  return schema === undefined ? value : decodeValue(value, schema);
}

/** Cache a schema's JSON Schema projection by schema identity.
 * @param schema - Schema used to validate or infer the value.
 * @returns The supported projection, or undefined when projection is unavailable.
 */
function projectedSchema(schema: StandardSchemaV1): JsonSchema | undefined {
  const cached = schemaCache.get(schema);
  if (cached !== undefined) return cached ?? undefined;
  const result = getJsonSchema(schema);
  const projected = result.ok ? result.schema : null;
  schemaCache.set(schema, projected);
  return projected ?? undefined;
}

/** Recursively decode strict number and boolean strings for a JSON Schema.
 * @param value - Value to validate or project.
 * @param schema - Schema used to validate or infer the value.
 * @returns The decoded value, retaining strings not accepted by the target type.
 */
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

/** Check whether a value already satisfies a JSON Schema primitive type.
 * @param value - Value to validate or project.
 * @param schema - Schema used to validate or infer the value.
 * @returns Whether the value needs no coercion for this variant.
 */
function acceptsType(value: unknown, schema: unknown): boolean {
  if (!isRecord(schema)) return false;
  if (schema.type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (schema.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (schema.type === "array") return Array.isArray(value);
  if (schema.type === "object") return isRecord(value);
  return typeof schema.type === "string" && typeof value === schema.type;
}

/** Recognize a Standard Schema v1 descriptor at the RPC boundary.
 * @param value - Value to validate or project.
 * @returns Whether the value exposes the supported Standard Schema marker.
 */
function isSchema(value: unknown): value is StandardSchemaV1 {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}

/** Check whether a value is a non-null object suitable for field inspection.
 * @param value - Value to validate or project.
 * @returns Whether object fields can be inspected.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
