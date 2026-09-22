import type { JsonValue, StandardSchemaV1 } from "./standard-schema.js";

export type SchemaProjection = () => JsonValue;
export type SchemaProjectionDirection = "input" | "output";

export interface SchemaMetadata {
  /** The historical projection used by getJsonSchema(schema) without options. */
  readonly jsonSchema?: SchemaProjection;
  readonly inputJsonSchema?: SchemaProjection;
  readonly outputJsonSchema?: SchemaProjection;
  readonly optional?: boolean;
  readonly inputOptional?: boolean;
  readonly outputOptional?: boolean;
  readonly transformed?: boolean;
  readonly refined?: boolean;
}

const metadataKey = Symbol.for("relkit.schema.metadata");

export function getSchemaMetadata(schema: StandardSchemaV1): SchemaMetadata | undefined {
  return (schema as StandardSchemaV1 & { [metadataKey]?: SchemaMetadata })[metadataKey];
}

export function setSchemaMetadata(schema: StandardSchemaV1, metadata: SchemaMetadata): void {
  Object.defineProperty(schema, metadataKey, { value: metadata, configurable: true });
}

export function getMetadataProjection(
  metadata: SchemaMetadata | undefined,
  direction: SchemaProjectionDirection | "legacy" = "legacy",
): SchemaProjection | undefined {
  if (metadata === undefined) return undefined;
  if (direction === "input") return metadata.inputJsonSchema ?? metadata.jsonSchema;
  if (direction === "output") return metadata.outputJsonSchema ?? metadata.jsonSchema;
  return metadata.jsonSchema;
}

export function isMetadataOptional(
  metadata: SchemaMetadata | undefined,
  direction: SchemaProjectionDirection | "legacy" = "legacy",
): boolean {
  if (metadata === undefined) return false;
  if (direction === "input") return metadata.inputOptional ?? metadata.optional === true;
  if (direction === "output") return metadata.outputOptional ?? metadata.optional === true;
  return metadata.optional === true;
}

export function isSchemaTransformed(schema: StandardSchemaV1): boolean {
  return getSchemaMetadata(schema)?.transformed === true;
}

export function withRefinementMetadata(schema: StandardSchemaV1): SchemaMetadata {
  return { ...(getSchemaMetadata(schema) ?? {}), refined: true };
}

export function withTransformMetadata(schema: StandardSchemaV1): SchemaMetadata {
  const metadata = getSchemaMetadata(schema);
  const input = getMetadataProjection(metadata, "input");
  return {
    ...(metadata?.refined === true ? { refined: true } : {}),
    ...(input === undefined ? {} : { inputJsonSchema: input }),
    ...(metadata?.inputOptional === undefined ? {} : { inputOptional: metadata.inputOptional }),
    transformed: true,
  };
}

export function withOptionalMetadata(schema: StandardSchemaV1): SchemaMetadata {
  return {
    ...(getSchemaMetadata(schema) ?? {}),
    optional: true,
    inputOptional: true,
    outputOptional: true,
  };
}

export function withNullableMetadata(schema: StandardSchemaV1): SchemaMetadata {
  const metadata = getSchemaMetadata(schema);
  const wrap = (projection: SchemaProjection | undefined): SchemaProjection | undefined =>
    projection === undefined ? undefined : () => ({ anyOf: [projection(), { type: "null" }] });
  const legacy = wrap(getMetadataProjection(metadata, "legacy"));
  const input = wrap(getMetadataProjection(metadata, "input"));
  const output = wrap(getMetadataProjection(metadata, "output"));
  return {
    ...(metadata ?? {}),
    ...(legacy === undefined ? {} : { jsonSchema: legacy }),
    ...(input === undefined ? {} : { inputJsonSchema: input }),
    ...(output === undefined ? {} : { outputJsonSchema: output }),
  };
}

export function withDefaultMetadata<T>(
  schema: StandardSchemaV1,
  value: T | (() => T),
): SchemaMetadata {
  const metadata = getSchemaMetadata(schema);
  const addDefault = (projection: SchemaProjection | undefined): SchemaProjection | undefined =>
    projection === undefined || typeof value === "function"
      ? projection
      : () => {
          const projected = projection();
          if (!isRecord(projected)) throw new TypeError("Schema projection must be an object");
          return { ...projected, default: value as unknown as JsonValue };
        };
  const legacy = addDefault(getMetadataProjection(metadata, "legacy"));
  const input = getMetadataProjection(metadata, "input");
  const output = addDefault(getMetadataProjection(metadata, "output"));
  return {
    ...(metadata ?? {}),
    optional: true,
    inputOptional: true,
    outputOptional: false,
    ...(legacy === undefined ? {} : { jsonSchema: legacy }),
    ...(input === undefined ? {} : { inputJsonSchema: input }),
    ...(output === undefined ? {} : { outputJsonSchema: output }),
  };
}

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
