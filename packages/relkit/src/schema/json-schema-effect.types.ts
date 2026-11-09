import type { JsonSchemaDirection, JsonSchemaFactory } from "./json-schema.types.js";
import type { StandardSchemaV1 } from "./standard-schema.types.js";

/**
 * Injectable boundary for a schema's JSON projection hook.
 * Test Layers can substitute projection without a third-party schema package.
 * @example Layer.succeed(SchemaProjector, { projection: () => () => ({ type: "string" }) });
 */
export interface SchemaProjectorService {
  /**
   * Selects a directional or legacy projection hook.
   * @param schema - Compatible schema to inspect.
   * @param direction - Input, output, or legacy projection.
   * @returns A projection factory when the schema exposes one.
   * @example projector.projection(z.string(), "input");
   */
  readonly projection: (
    schema: StandardSchemaV1,
    direction: JsonSchemaDirection | "legacy",
  ) => JsonSchemaFactory | undefined;
}
