import { Context, Data, Effect, Layer } from "effect";
import { getSchemaProjection } from "./json-schema-inspection.js";
import { sortJsonValue } from "./json-schema.js";
import { observeSchema } from "./schema-observability.js";
import type { SchemaProjectorService } from "./json-schema-effect.types.js";
import type { JsonSchema, JsonSchemaOptions } from "./json-schema.types.js";
import type { StandardSchemaV1 } from "./standard-schema.types.js";

/**
 * Tagged failure for an unavailable or invalid JSON Schema projection.
 * @example Effect.catchTag("JsonSchemaUnavailableError", (error) => Effect.succeed(error.reason));
 */
export class JsonSchemaUnavailableError extends Data.TaggedError("JsonSchemaUnavailableError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {
  override get message(): string {
    return this.reason;
  }
}

/**
 * Injectable JSON Schema projection boundary.
 * @example Effect.provide(getJsonSchemaEffect(z.string()), SchemaProjectorLive);
 */
export class SchemaProjector extends Context.Service<SchemaProjector, SchemaProjectorService>()(
  "relkit/schema/SchemaProjector",
) {}

/**
 * Live JSON Schema projector using registered schema metadata and hooks.
 * @example Effect.runSync(Effect.provide(getJsonSchemaEffect(z.string()), SchemaProjectorLive));
 */
export const SchemaProjectorLive = Layer.succeed(SchemaProjector, {
  projection: getSchemaProjection,
});

/**
 * Projects a validator into canonical JSON Schema with typed failures.
 * @param schema - Validator with a deterministic projection hook.
 * @param options - Input or output direction, when needed.
 * @returns Canonical JSON Schema, or JsonSchemaUnavailableError.
 * @example Effect.runSync(Effect.provide(getJsonSchemaEffect(z.string()), SchemaProjectorLive));
 */
export function getJsonSchemaEffect(
  schema: StandardSchemaV1,
  options?: JsonSchemaOptions,
): Effect.Effect<JsonSchema, JsonSchemaUnavailableError, SchemaProjector> {
  return observeSchema(
    "json-schema",
    Effect.gen(function* () {
      if (schema?.["~standard"]?.version !== 1) {
        return yield* Effect.fail(
          new JsonSchemaUnavailableError({
            reason: "Schema is not a Standard Schema v1 validator",
          }),
        );
      }
      const direction = options?.direction ?? "legacy";
      if (direction !== "legacy" && direction !== "input" && direction !== "output") {
        return yield* Effect.fail(
          new JsonSchemaUnavailableError({
            reason: `Unsupported schema projection direction "${String(direction)}"`,
          }),
        );
      }
      const projector = yield* SchemaProjector;
      const projection = yield* Effect.try({
        try: () => projector.projection(schema, direction),
        catch: (cause) => new JsonSchemaUnavailableError({ reason: errorMessage(cause), cause }),
      });
      if (projection === undefined) {
        return yield* Effect.fail(
          new JsonSchemaUnavailableError({
            reason: "Schema does not expose a deterministic projection",
          }),
        );
      }
      return yield* Effect.try({
        try: () => {
          const value = sortJsonValue(projection(), "$", undefined);
          if (!isRecord(value)) throw new TypeError("Schema projection must be a JSON object");
          return value;
        },
        catch: (cause) => new JsonSchemaUnavailableError({ reason: errorMessage(cause), cause }),
      });
    }),
  );
}

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
