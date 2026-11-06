import type { JsonValue } from "./standard-schema.types.js";
import type { SchemaProjectionDirection } from "./schema-metadata.types.js";
import type { JSON_SCHEMA_UNAVAILABLE } from "./json-schema.js";

/**
 * A deterministic JSON Schema document.
 * @example const document: JsonSchema = { type: "string" };
 */
export type JsonSchema = { readonly [key: string]: JsonValue };
/**
 * A successful JSON Schema projection.
 * @example const available: JsonSchemaAvailable = { ok: true, schema: { type: "string" } };
 */
export interface JsonSchemaAvailable {
  readonly ok: true;
  readonly schema: JsonSchema;
}
/**
 * An unavailable projection with a stable code and reason.
 * @example const unavailable: JsonSchemaUnavailable = { ok: false, code: JSON_SCHEMA_UNAVAILABLE, reason: "missing" };
 */
export interface JsonSchemaUnavailable {
  readonly ok: false;
  readonly code: typeof JSON_SCHEMA_UNAVAILABLE;
  readonly reason: string;
}
/**
 * The result of a JSON Schema projection.
 * @example const result: JsonSchemaResult = getJsonSchema(z.string());
 */
export type JsonSchemaResult = JsonSchemaAvailable | JsonSchemaUnavailable;
/**
 * Factory for a JSON-safe schema value.
 * @example const projection: JsonSchemaFactory = () => ({ type: "string" });
 */
export type JsonSchemaFactory = () => JsonValue;
/**
 * Projection direction accepted by getJsonSchema.
 * @example const direction: JsonSchemaDirection = "input";
 */
export type JsonSchemaDirection = SchemaProjectionDirection;
/**
 * Options for a JSON Schema projection.
 * @example const options: JsonSchemaOptions = { direction: "output" };
 */
export interface JsonSchemaOptions {
  readonly direction?: JsonSchemaDirection;
}
