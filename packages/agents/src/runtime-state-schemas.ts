import type { StandardSchemaV1 } from "@relkit/schema";

export function selectedStateSchemas(
  sources: readonly unknown[],
  selected: readonly string[],
): ReadonlyMap<string, StandardSchemaV1> {
  const schemas = new Map<string, StandardSchemaV1>();
  for (const source of sources) {
    const fields = stateFields(source);
    for (const key of selected) {
      const schema = fields?.[key];
      if (isStandardSchema(schema)) schemas.set(key, schema);
    }
  }
  for (const key of selected) {
    if (!schemas.has(key)) throw new TypeError(`Agent client state key "${key}" has no validator`);
  }
  return schemas;
}

function stateFields(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if (isRecord(value.fields)) return value.fields;
  const shape = typeof value.shape === "function" ? value.shape() : value.shape;
  return isRecord(shape) ? shape : undefined;
}

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
