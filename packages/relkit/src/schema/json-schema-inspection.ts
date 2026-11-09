import { Effect } from "effect";
import { getMetadataProjection, getSchemaMetadata, isMetadataOptional } from "./schema-metadata.js";
import { schemaConverter } from "./schema-converters.js";
import { runSchemaSync } from "./schema-observability.js";
import type { RelkitProjectable, StandardProjectable } from "./json-schema-inspection.types.js";
import type { JsonSchemaDirection, JsonSchemaFactory } from "./json-schema.types.js";
import type { JsonValue, StandardSchemaV1 } from "./standard-schema.types.js";

/**
 * Finds a deterministic projection inside Effect: RelKit builder metadata, then the schema's
 * `~standard.jsonSchema` hook, then a converter for the schema's library.
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
    const standard = schema?.["~standard"] as StandardProjectable;
    // Third-party schemas describe each side separately; an undirected request takes the
    // output side, then the input side. RelKit's own transformed schemas stay directional.
    if (direction === "legacy")
      return standard?.vendor === "relkit"
        ? undefined
        : (sideProjection(schema, standard, "output") ?? sideProjection(schema, standard, "input"));
    return sideProjection(schema, standard, direction);
  });
}

function sideProjection(
  schema: StandardSchemaV1,
  standard: StandardProjectable,
  direction: "input" | "output",
): JsonSchemaFactory | undefined {
  const hook = standard?.jsonSchema?.[direction];
  if (hook !== undefined) return () => hook({ target: "draft-2020-12" }) as JsonValue;
  const convert = schemaConverter(schema);
  return convert === undefined ? undefined : () => convert(schema, direction);
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
