import { Effect } from "effect";
import { runSchemaSync } from "./schema-observability.js";
import { getMetadataProjection, getSchemaMetadata } from "./schema-metadata.js";
import type { SchemaMetadata, SchemaProjection } from "./schema-metadata.types.js";
import type { JsonValue, StandardSchemaV1 } from "./standard-schema.types.js";

/**
 * Builds refinement metadata in Effect.
 * @param schema - Schema being refined.
 * @returns Metadata preserving projections and marking refinement.
 * @example Effect.runSync(withRefinementMetadataEffect(z.string()));
 */
export function withRefinementMetadataEffect(
  schema: StandardSchemaV1,
): Effect.Effect<SchemaMetadata> {
  return Effect.sync(() => ({ ...(getSchemaMetadata(schema) ?? {}), refined: true }));
}

/**
 * Preserves projection metadata while marking a schema refined.
 * @param schema - Schema being refined.
 * @returns Updated metadata.
 * @example withRefinementMetadata(z.string());
 */
export function withRefinementMetadata(schema: StandardSchemaV1): SchemaMetadata {
  return runSchemaSync(withRefinementMetadataEffect(schema));
}

/**
 * Builds transform metadata in Effect.
 * @param schema - Schema being transformed.
 * @returns Metadata retaining the input projection.
 * @example Effect.runSync(withTransformMetadataEffect(z.string()));
 */
export function withTransformMetadataEffect(
  schema: StandardSchemaV1,
): Effect.Effect<SchemaMetadata> {
  return Effect.sync(() => {
    const metadata = getSchemaMetadata(schema);
    const input = getMetadataProjection(metadata, "input");
    return {
      ...(metadata?.refined === true ? { refined: true } : {}),
      ...(input === undefined ? {} : { inputJsonSchema: input }),
      ...(metadata?.inputOptional === undefined ? {} : { inputOptional: metadata.inputOptional }),
      transformed: true,
    };
  });
}

/**
 * Keeps only input projection metadata after a transform.
 * @param schema - Schema being transformed.
 * @returns Updated metadata.
 * @example withTransformMetadata(z.string());
 */
export function withTransformMetadata(schema: StandardSchemaV1): SchemaMetadata {
  return runSchemaSync(withTransformMetadataEffect(schema));
}

/**
 * Builds optional metadata in Effect.
 * @param schema - Schema made optional.
 * @returns Metadata marking both directions optional.
 * @example Effect.runSync(withOptionalMetadataEffect(z.string()));
 */
export function withOptionalMetadataEffect(
  schema: StandardSchemaV1,
): Effect.Effect<SchemaMetadata> {
  return Effect.sync(() => ({
    ...(getSchemaMetadata(schema) ?? {}),
    optional: true,
    inputOptional: true,
    outputOptional: true,
  }));
}

/**
 * Marks a schema optional in both projection directions.
 * @param schema - Schema made optional.
 * @returns Updated metadata.
 * @example withOptionalMetadata(z.string());
 */
export function withOptionalMetadata(schema: StandardSchemaV1): SchemaMetadata {
  return runSchemaSync(withOptionalMetadataEffect(schema));
}

/**
 * Builds nullable metadata in Effect.
 * @param schema - Schema made nullable.
 * @returns Metadata with nullable projections.
 * @example Effect.runSync(withNullableMetadataEffect(z.string()));
 */
export function withNullableMetadataEffect(
  schema: StandardSchemaV1,
): Effect.Effect<SchemaMetadata> {
  return Effect.sync(() => {
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
  });
}

/**
 * Wraps each available projection in a nullable union.
 * @param schema - Schema made nullable.
 * @returns Updated metadata.
 * @example withNullableMetadata(z.string());
 */
export function withNullableMetadata(schema: StandardSchemaV1): SchemaMetadata {
  return runSchemaSync(withNullableMetadataEffect(schema));
}

/**
 * Builds default metadata in Effect without evaluating lazy values.
 * @param schema - Schema given a default.
 * @param value - Constant or lazy default.
 * @returns Metadata with output and legacy defaults when static.
 * @example Effect.runSync(withDefaultMetadataEffect(z.string(), "ready"));
 */
export function withDefaultMetadataEffect<T>(
  schema: StandardSchemaV1,
  value: T | (() => T),
): Effect.Effect<SchemaMetadata> {
  return Effect.sync(() => {
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
  });
}

/**
 * Adds a static default only to output and legacy projections.
 * @param schema - Schema given a default.
 * @param value - Constant or lazy default.
 * @returns Updated metadata.
 * @example withDefaultMetadata(z.string(), "ready");
 */
export function withDefaultMetadata<T>(
  schema: StandardSchemaV1,
  value: T | (() => T),
): SchemaMetadata {
  return runSchemaSync(withDefaultMetadataEffect(schema, value));
}

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
