import type { JsonValue, StandardSchemaV1 } from "./standard-schema.types.js";

/**
 * Converts one schema to JSON Schema for the input or output side.
 * @example const converter: SchemaConverter = (schema, direction) => ({ type: "string" });
 */
export type SchemaConverter = (
  schema: StandardSchemaV1,
  direction: "input" | "output",
) => JsonValue;

/**
 * A schema library RelKit recognizes, with the package that makes its schemas and, when the
 * schemas cannot describe themselves, the package that converts them.
 * @example const valibot: SchemaLibrary = { package: "valibot", converter: "@valibot/to-json-schema" };
 */
export interface SchemaLibrary {
  readonly package: string;
  readonly converter?: string;
}

/**
 * A converter that loaded, or the reason it could not.
 * @example const missing: LoadedConverter = { error: "Install @valibot/to-json-schema." };
 */
export interface LoadedConverter {
  readonly convert?: SchemaConverter;
  readonly error?: string;
}
