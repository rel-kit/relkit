import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { JsonValue } from "@relkit/contracts";

export type ClientSchemaMetadata = JsonValue | { readonly kind: "dynamic" };
export interface ClientTypeField {
  readonly name: string;
  readonly schema: ClientSchemaMetadata;
  readonly optional?: true;
}

export const dynamicClientSchema = Object.freeze({ kind: "dynamic" as const });

export function mergeClientSchemas(values: readonly unknown[]): ClientSchemaMetadata {
  const documents = values.map(clientSchemaMetadata).filter(isJsonSchemaObject);
  return {
    type: "object",
    properties: Object.assign({}, ...documents.map(schemaProperties)),
    required: [...new Set(documents.flatMap(schemaRequired))],
  } as JsonValue;
}

export function selectedClientFields(
  schema: ClientSchemaMetadata,
  keys?: readonly string[],
): readonly ClientTypeField[] {
  if (keys === undefined || !isJsonSchemaObject(schema)) return Object.freeze([]);
  const document = schema as Record<string, unknown>;
  const required = new Set(schemaRequired(document));
  const properties = schemaProperties(document);
  return Object.freeze(
    keys.map((name) => {
      const value = properties[name];
      const field = value === undefined ? dynamicClientSchema : value;
      const defaulted = isRecord(field) && Object.hasOwn(field, "default");
      return {
        name,
        schema: field,
        ...(!required.has(name) && !defaulted ? { optional: true as const } : {}),
      };
    }),
  );
}

export function clientSchemaMetadata(value: unknown): ClientSchemaMetadata {
  if (isDynamic(value) || isJsonSchemaObject(value)) return value;
  try {
    return JSON.parse(JSON.stringify(toJsonSchema(value as never))) as JsonValue;
  } catch {
    return dynamicClientSchema;
  }
}

function isJsonSchemaObject(value: unknown): value is Record<string, any> {
  if (!isRecord(value) || value.kind === "dynamic") return false;
  return ["type", "properties", "oneOf", "anyOf", "allOf", "enum", "const", "$ref"].some((key) =>
    Object.hasOwn(value, key),
  );
}

function schemaProperties(value: Record<string, unknown>): Record<string, ClientSchemaMetadata> {
  return isRecord(value.properties)
    ? (value.properties as Record<string, ClientSchemaMetadata>)
    : {};
}

function schemaRequired(value: Record<string, unknown>): string[] {
  return Array.isArray(value.required)
    ? value.required.filter((item): item is string => typeof item === "string")
    : [];
}

function isDynamic(value: unknown): value is { readonly kind: "dynamic" } {
  return isRecord(value) && value.kind === "dynamic" && Object.keys(value).length === 1;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
