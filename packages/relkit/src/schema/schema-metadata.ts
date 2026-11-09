import { Data, Effect } from "effect";
import { runSchemaSync } from "./schema-observability.js";
import type { StandardSchemaV1 } from "./standard-schema.types.js";
import type {
  SchemaMetadata,
  SchemaProjection,
  SchemaProjectionDirection,
} from "./schema-metadata.types.js";

export type {
  SchemaMetadata,
  SchemaProjection,
  SchemaProjectionDirection,
} from "./schema-metadata.types.js";
export {
  withDefaultMetadata,
  withNullableMetadata,
  withOptionalMetadata,
  withRefinementMetadata,
  withTransformMetadata,
} from "./schema-metadata-composition.js";

const metadataKey = Symbol.for("relkit.schema.metadata");

/**
 * Tagged failure when schema metadata cannot be attached.
 * The original exception remains available in `cause`.
 * @example Effect.catchTag("SchemaMetadataError", (error) => Effect.succeed(error.cause));
 */
export class SchemaMetadataError extends Data.TaggedError("SchemaMetadataError")<{
  readonly cause: unknown;
}> {}

/**
 * Reads attached metadata inside Effect.
 * @param schema - Schema to inspect.
 * @returns Optional metadata in the Effect success channel.
 * @example Effect.runSync(getSchemaMetadataEffect(z.string()));
 */
export function getSchemaMetadataEffect(
  schema: StandardSchemaV1,
): Effect.Effect<SchemaMetadata | undefined> {
  return Effect.sync(
    () => (schema as StandardSchemaV1 & { [metadataKey]?: SchemaMetadata })[metadataKey],
  );
}

/**
 * Reads metadata attached to a schema.
 * @param schema - Schema to inspect.
 * @returns Attached metadata, if present.
 * @example getSchemaMetadata(z.string());
 */
export function getSchemaMetadata(schema: StandardSchemaV1): SchemaMetadata | undefined {
  return runSchemaSync(getSchemaMetadataEffect(schema));
}

/**
 * Attaches metadata inside Effect.
 * @param schema - Schema to annotate.
 * @param metadata - Projection and refinement metadata.
 * @returns An Effect that completes after metadata is attached, or SchemaMetadataError.
 * @example Effect.runSync(setSchemaMetadataEffect(z.string(), {}));
 */
export function setSchemaMetadataEffect(
  schema: StandardSchemaV1,
  metadata: SchemaMetadata,
): Effect.Effect<void, SchemaMetadataError> {
  return Effect.try({
    try: () => {
      Object.defineProperty(schema, metadataKey, { value: metadata, configurable: true });
    },
    catch: (cause) => new SchemaMetadataError({ cause }),
  });
}

/**
 * Attaches metadata for cross-copy projection lookup.
 * @param schema - Schema to annotate.
 * @param metadata - Projection and refinement metadata.
 * @returns Nothing after metadata is attached.
 * @throws The original property-definition error.
 * @example setSchemaMetadata(z.string(), { optional: true });
 */
export function setSchemaMetadata(schema: StandardSchemaV1, metadata: SchemaMetadata): void {
  try {
    runSchemaSync(setSchemaMetadataEffect(schema, metadata));
  } catch (error) {
    if (error instanceof SchemaMetadataError) throw error.cause;
    throw error;
  }
}

/**
 * Selects the requested projection hook inside Effect.
 * @param metadata - Optional schema metadata.
 * @param direction - Legacy, input, or output direction.
 * @returns The matching hook, if one exists.
 * @example Effect.runSync(getMetadataProjectionEffect({}, "input"));
 */
export function getMetadataProjectionEffect(
  metadata: SchemaMetadata | undefined,
  direction: SchemaProjectionDirection | "legacy" = "legacy",
): Effect.Effect<SchemaMetadata["jsonSchema"]> {
  return Effect.sync(() => {
    if (metadata === undefined) return undefined;
    if (direction === "input") return metadata.inputJsonSchema ?? metadata.jsonSchema;
    if (direction === "output") return metadata.outputJsonSchema ?? metadata.jsonSchema;
    return metadata.jsonSchema;
  });
}

/**
 * Selects the projection hook for a direction.
 * @param metadata - Optional schema metadata.
 * @param direction - Legacy, input, or output direction.
 * @returns The matching hook, if present.
 * @example getMetadataProjection({}, "output");
 */
export function getMetadataProjection(
  metadata: SchemaMetadata | undefined,
  direction: SchemaProjectionDirection | "legacy" = "legacy",
): SchemaProjection | undefined {
  return runSchemaSync(getMetadataProjectionEffect(metadata, direction));
}

/**
 * Checks optionality inside Effect.
 * @param metadata - Optional schema metadata.
 * @param direction - Legacy, input, or output direction.
 * @returns Whether an omitted property is accepted.
 * @example Effect.runSync(isMetadataOptionalEffect({ optional: true }));
 */
export function isMetadataOptionalEffect(
  metadata: SchemaMetadata | undefined,
  direction: SchemaProjectionDirection | "legacy" = "legacy",
): Effect.Effect<boolean> {
  return Effect.sync(() => {
    if (metadata === undefined) return false;
    if (direction === "input") return metadata.inputOptional ?? metadata.optional === true;
    if (direction === "output") return metadata.outputOptional ?? metadata.optional === true;
    return metadata.optional === true;
  });
}

/**
 * Checks whether a schema accepts an omitted property.
 * @param metadata - Optional schema metadata.
 * @param direction - Legacy, input, or output direction.
 * @returns Whether the schema is optional in that direction.
 * @example isMetadataOptional({ optional: true });
 */
export function isMetadataOptional(
  metadata: SchemaMetadata | undefined,
  direction: SchemaProjectionDirection | "legacy" = "legacy",
): boolean {
  return runSchemaSync(isMetadataOptionalEffect(metadata, direction));
}

/**
 * Checks whether a schema has been transformed inside Effect.
 * @param schema - Schema to inspect.
 * @returns Whether transform metadata is set.
 * @example Effect.runSync(isSchemaTransformedEffect(z.string()));
 */
export function isSchemaTransformedEffect(schema: StandardSchemaV1): Effect.Effect<boolean> {
  return Effect.map(getSchemaMetadataEffect(schema), (metadata) => metadata?.transformed === true);
}

/**
 * Checks whether a schema has a value transform.
 * @param schema - Schema to inspect.
 * @returns Whether transform metadata is set.
 * @example isSchemaTransformed(z.string().transform(Number));
 */
export function isSchemaTransformed(schema: StandardSchemaV1): boolean {
  return runSchemaSync(isSchemaTransformedEffect(schema));
}
