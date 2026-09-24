import { Effect } from "effect";
import { getMetadataProjection, getSchemaMetadata, isMetadataOptional } from "./schema-metadata.js";
import { runSchemaSync } from "./schema-observability.js";
import type { RelkitProjectable, StandardProjectable } from "./json-schema-inspection.types.js";
import type { JsonSchemaDirection, JsonSchemaFactory } from "./json-schema.types.js";
import type { JsonValue, StandardSchemaV1 } from "./standard-schema.types.js";

/**
 * Finds a deterministic projection hook inside Effect.
 * @param schema - Compatible schema to inspect.
 * @param direction - Legacy, input, or output direction.
 * @returns A projection factory, if available.
 * @example Effect.runSync(getSchemaProjectionEffect(z.string(), "input"));
 */
export function getSchemaProjectionEffect(
  schema: StandardSchemaV1,
  direction: JsonSchemaDirection | "legacy" = "legacy",
): Effect.Effect<JsonSchemaFactory | undefined> {
  return Effect.sync(() => {
    const metadata = getSchemaMetadata(schema);
    const projected = getMetadataProjection(metadata, direction);
    if (projected) return projected;
    const relkit = schema as RelkitProjectable;
    const relkitProjection =
      direction === "input"
        ? relkit.relkit?.inputJsonSchema
        : direction === "output"
          ? relkit.relkit?.outputJsonSchema
          : relkit.relkit?.jsonSchema;
    if (relkitProjection) return relkitProjection;
    if (direction === "legacy") return undefined;
    const standard = schema?.["~standard"] as StandardProjectable;
    const hook = standard.jsonSchema?.[direction];
    return hook === undefined ? undefined : () => hook({ target: "draft-2020-12" }) as JsonValue;
  });
}

/**
 * Finds a deterministic projection hook without executing it.
 * @param schema - Compatible schema to inspect.
 * @param direction - Legacy, input, or output direction.
 * @returns A projection factory, if available.
 * @example getSchemaProjection(z.string(), "input");
 */
export function getSchemaProjection(
  schema: StandardSchemaV1,
  direction: JsonSchemaDirection | "legacy" = "legacy",
): JsonSchemaFactory | undefined {
  return runSchemaSync(getSchemaProjectionEffect(schema, direction));
}

/**
 * Checks schema optionality inside Effect.
 * @param schema - Compatible schema to inspect.
 * @param direction - Legacy, input, or output direction.
 * @returns Whether an omitted property is accepted.
 * @example Effect.runSync(isSchemaOptionalEffect(z.string().optional()));
 */
export function isSchemaOptionalEffect(
  schema: StandardSchemaV1,
  direction: JsonSchemaDirection | "legacy" = "legacy",
): Effect.Effect<boolean> {
  return Effect.sync(() => isMetadataOptional(getSchemaMetadata(schema), direction));
}

/**
 * Checks whether a schema accepts an omitted property.
 * @param schema - Compatible schema to inspect.
 * @param direction - Legacy, input, or output direction.
 * @returns Whether the schema is optional in that direction.
 * @example isSchemaOptional(z.string().optional());
 */
export function isSchemaOptional(
  schema: StandardSchemaV1,
  direction: JsonSchemaDirection | "legacy" = "legacy",
): boolean {
  return runSchemaSync(isSchemaOptionalEffect(schema, direction));
}
