import type { JsonValue } from "./standard-schema.types.js";

/**
 * Factory for a JSON-safe schema projection.
 * @example const projection: SchemaProjection = () => ({ type: "string" });
 */
export type SchemaProjection = () => JsonValue;
/**
 * Projection direction for input or validated output.
 * @example const direction: SchemaProjectionDirection = "input";
 */
export type SchemaProjectionDirection = "input" | "output";

/**
 * Metadata attached to a RELKIT schema for deterministic projection.
 * Directional hooks may differ after a transform or default is applied.
 * @example const metadata: SchemaMetadata = { jsonSchema: () => ({ type: "string" }) };
 */
export interface SchemaMetadata {
  /** Historical projection used by getJsonSchema(schema) without options. */
  readonly jsonSchema?: SchemaProjection;
  readonly inputJsonSchema?: SchemaProjection;
  readonly outputJsonSchema?: SchemaProjection;
  readonly optional?: boolean;
  readonly inputOptional?: boolean;
  readonly outputOptional?: boolean;
  readonly transformed?: boolean;
  readonly refined?: boolean;
}
