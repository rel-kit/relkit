import { createSchema, issue, runSchema, type Schema } from "./standard-schema.js";
import { buildSchema } from "./builder-effect.js";
import { collectResults, collectUnion } from "./schema-collection.js";
import { getSchemaProjection, isSchemaOptional } from "./json-schema.js";
import type { SchemaMetadata } from "./schema-metadata.js";
import type {
  AnySchema,
  InputOf,
  ObjectInput,
  ObjectOutput,
  OutputOf,
  SchemaTuple,
  Shape,
} from "./builder-composites.types.js";
import type { JsonValue } from "./standard-schema.js";
import type { StandardSchemaV1 } from "./standard-schema.types.js";

/**
 * Builds an object validator from named child schemas.
 * @param shape - Child schemas by property name.
 * @returns An object schema with inferred optional keys and ordered issues.
 * @example objectSchema({ id: z.string() });
 */
export function objectSchema<S extends Shape>(shape: S): Schema<ObjectInput<S>, ObjectOutput<S>> {
  return buildSchema("builder.object", () => {
    const legacyJsonSchema = objectProjection(shape, "legacy");
    const inputJsonSchema = objectProjection(shape, "input");
    const outputJsonSchema = objectProjection(shape, "output");
    return createSchema(
      (value, path) => {
        if (!isRecord(value)) return issue("Expected an object", path);
        const entries = Object.entries(shape);
        return collectResults(
          entries.map(
            ([key, schema]) =>
              () =>
                runSchema(schema, value[key], [...path, key]),
          ),
          (values) => {
            const output: Record<string, unknown> = {};
            entries.forEach(([key], index) => {
              const item = values[index];
              if (item !== undefined || key in value) output[key] = item;
            });
            return output as ObjectOutput<S>;
          },
        );
      },
      {
        ...(legacyJsonSchema === undefined ? {} : { jsonSchema: legacyJsonSchema }),
        ...(inputJsonSchema === undefined ? {} : { inputJsonSchema }),
        ...(outputJsonSchema === undefined ? {} : { outputJsonSchema }),
      },
    );
  });
}

/**
 * Builds an array validator from one item schema.
 * @param schema - Validator for each array item.
 * @returns An array schema with ordered issues and outputs.
 * @example arraySchema(z.number());
 */
export function arraySchema<S extends AnySchema>(schema: S): Schema<InputOf<S>[], OutputOf<S>[]> {
  return buildSchema("builder.array", () => {
    const legacyItemProjection = getSchemaProjection(schema);
    const inputItemProjection = getSchemaProjection(schema, "input");
    const outputItemProjection = getSchemaProjection(schema, "output");
    return createSchema(
      (value, path) => {
        if (!Array.isArray(value)) return issue("Expected an array", path);
        const tasks = value.map(
          (item, index) => () =>
            runSchema(schema as StandardSchemaV1<unknown, OutputOf<S>>, item, [...path, index]),
        );
        return collectResults(tasks, (items) => items);
      },
      {
        ...(legacyItemProjection === undefined
          ? {}
          : { jsonSchema: () => ({ type: "array", items: legacyItemProjection() }) }),
        ...(inputItemProjection === undefined
          ? {}
          : { inputJsonSchema: () => ({ type: "array", items: inputItemProjection() }) }),
        ...(outputItemProjection === undefined
          ? {}
          : { outputJsonSchema: () => ({ type: "array", items: outputItemProjection() }) }),
      },
    );
  });
}

/**
 * Builds a nonempty union with first-success precedence.
 * @param schemas - Member validators in declaration order.
 * @returns A union schema with inferred member types.
 * @example unionSchema([z.string(), z.number()]);
 */
export function unionSchema<S extends SchemaTuple>(
  schemas: S,
): Schema<InputOf<S[number]>, OutputOf<S[number]>> {
  return buildSchema("builder.union", () => {
    const legacyProjections = schemas.map((schema) => getSchemaProjection(schema));
    const inputProjections = schemas.map((schema) => getSchemaProjection(schema, "input"));
    const outputProjections = schemas.map((schema) => getSchemaProjection(schema, "output"));
    return createSchema(
      (value, path) => {
        const tasks = schemas.map(
          (schema) => () =>
            runSchema(schema as StandardSchemaV1<unknown, OutputOf<S[number]>>, value, path),
        );
        return collectUnion(tasks, path);
      },
      {
        ...(legacyProjections.every((projection) => projection)
          ? { jsonSchema: () => ({ anyOf: legacyProjections.map((projection) => projection!()) }) }
          : {}),
        ...(inputProjections.every((projection) => projection)
          ? {
              inputJsonSchema: () => ({
                anyOf: inputProjections.map((projection) => projection!()),
              }),
            }
          : {}),
        ...(outputProjections.every((projection) => projection)
          ? {
              outputJsonSchema: () => ({
                anyOf: outputProjections.map((projection) => projection!()),
              }),
            }
          : {}),
      },
    );
  });
}

function objectProjection(
  shape: Shape,
  direction: "input" | "output" | "legacy",
): SchemaMetadata["jsonSchema"] | undefined {
  const entries = Object.keys(shape)
    .sort()
    .map((key) => {
      const schema = shape[key]!;
      return [
        key,
        getSchemaProjection(schema, direction),
        isSchemaOptional(schema, direction),
      ] as const;
    });
  if (entries.some(([, projection]) => !projection)) return undefined;
  return () => {
    const properties: Record<string, JsonValue> = {};
    const required: string[] = [];
    for (const [key, projection, optional] of entries) {
      properties[key] = projection!();
      if (!optional) required.push(key);
    }
    const schema: Record<string, JsonValue> = { properties, type: "object" };
    if (required.length > 0) schema.required = required;
    return schema;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
