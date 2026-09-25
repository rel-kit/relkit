import type { JsonSchemaFactory } from "./json-schema.types.js";
import type { StandardSchemaV1 } from "./standard-schema.types.js";

/**
 * RELKIT extension hook shapes for directional JSON projections.
 * @example const projection = (schema as RelkitProjectable).relkit?.inputJsonSchema;
 */
export type RelkitProjectable = StandardSchemaV1 & {
  readonly relkit?: {
    readonly jsonSchema?: JsonSchemaFactory;
    readonly inputJsonSchema?: JsonSchemaFactory;
    readonly outputJsonSchema?: JsonSchemaFactory;
  };
};

/**
 * Standard JSON Schema extension hook shapes for compatible schemas.
 * @example const hook = (schema["~standard"] as StandardProjectable).jsonSchema?.input;
 */
export type StandardProjectable = StandardSchemaV1["~standard"] & {
  readonly jsonSchema?: {
    readonly input?: (options: { readonly target: "draft-2020-12" }) => Record<string, unknown>;
    readonly output?: (options: { readonly target: "draft-2020-12" }) => Record<string, unknown>;
  };
};
