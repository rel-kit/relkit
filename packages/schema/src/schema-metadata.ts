import type { JsonValue, StandardSchemaV1 } from "./standard-schema.js";

export interface SchemaMetadata {
  readonly jsonSchema?: () => JsonValue;
  readonly optional?: boolean;
}

const metadataBySchema = new WeakMap<StandardSchemaV1, SchemaMetadata>();

export function getSchemaMetadata(schema: StandardSchemaV1): SchemaMetadata | undefined {
  return metadataBySchema.get(schema);
}

export function setSchemaMetadata(schema: StandardSchemaV1, metadata: SchemaMetadata): void {
  metadataBySchema.set(schema, metadata);
}

export function withOptionalMetadata(schema: StandardSchemaV1): SchemaMetadata {
  return { ...(getSchemaMetadata(schema) ?? {}), optional: true };
}

export function withNullableMetadata(schema: StandardSchemaV1): SchemaMetadata {
  const metadata = getSchemaMetadata(schema);
  if (!metadata?.jsonSchema) return metadata ?? {};
  return {
    ...metadata,
    jsonSchema: () => ({ anyOf: [metadata.jsonSchema!(), { type: "null" }] }),
  };
}

export function withDefaultMetadata<T>(
  schema: StandardSchemaV1,
  value: T | (() => T),
): SchemaMetadata {
  const metadata = getSchemaMetadata(schema);
  if (!metadata?.jsonSchema) return metadata ? { ...metadata, optional: true } : { optional: true };
  return {
    ...metadata,
    optional: true,
    jsonSchema: () => {
      const projected = metadata.jsonSchema!();
      if (!isRecord(projected)) throw new TypeError("Schema projection must be an object");
      return { ...projected, default: value as unknown as JsonValue };
    },
  };
}

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
