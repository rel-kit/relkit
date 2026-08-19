import {
  createSchema,
  issue,
  isPromiseLike,
  runSchema,
  type Schema,
  type StandardPathSegment,
  type StandardResult,
} from "./standard-schema.js";
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
} from "./builder.js";
import type { JsonValue } from "./standard-schema.js";

export function objectSchema<S extends Shape>(shape: S): Schema<ObjectInput<S>, ObjectOutput<S>> {
  const jsonSchema = objectProjection(shape);
  return createSchema(
    (value, path) => {
      if (!isRecord(value)) return issue("Expected an object", path);
      const entries = Object.entries(shape).map(
        ([key, schema]) => [key, runSchema(schema, value[key], [...path, key])] as const,
      );
      return collectResults(
        entries.map(([, result]) => result),
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
    jsonSchema ? { jsonSchema } : {},
  );
}

export function arraySchema<S extends AnySchema>(schema: S): Schema<InputOf<S>[], OutputOf<S>[]> {
  const itemProjection = getSchemaProjection(schema);
  return createSchema(
    (value, path) => {
      if (!Array.isArray(value)) return issue("Expected an array", path);
      const results = value.map((item, index) => runSchema(schema, item, [...path, index])) as (
        StandardResult<OutputOf<S>> | Promise<StandardResult<OutputOf<S>>>
      )[];
      return collectResults(results, (items) => items);
    },
    itemProjection ? { jsonSchema: () => ({ type: "array", items: itemProjection() }) } : {},
  );
}

export function unionSchema<S extends SchemaTuple>(
  schemas: S,
): Schema<InputOf<S[number]>, OutputOf<S[number]>> {
  const projections = schemas.map(getSchemaProjection);
  return createSchema(
    (value, path) => {
      const results = schemas.map((schema) => runSchema(schema, value, path)) as (
        StandardResult<OutputOf<S[number]>> | Promise<StandardResult<OutputOf<S[number]>>>
      )[];
      return collectUnion(results, path);
    },
    projections.every((projection) => projection)
      ? { jsonSchema: () => ({ anyOf: projections.map((projection) => projection!()) }) }
      : {},
  );
}

function objectProjection(shape: Shape): SchemaMetadata["jsonSchema"] | undefined {
  const entries = Object.keys(shape)
    .sort()
    .map((key) => {
      const schema = shape[key]!;
      return [key, getSchemaProjection(schema), isSchemaOptional(schema)] as const;
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

function objectValue(value: StandardResult<unknown>): value is { readonly value: unknown } {
  return !("issues" in value) || value.issues === undefined;
}

function collectResults<T, U>(
  results: readonly (StandardResult<T> | Promise<StandardResult<T>>)[],
  map: (values: T[]) => U,
): StandardResult<U> | Promise<StandardResult<U>> {
  if (results.some(isPromiseLike)) {
    return Promise.all(results.map((result) => Promise.resolve(result))).then((resolved) =>
      collectValues(resolved, map),
    );
  }
  return collectValues(results as readonly StandardResult<T>[], map);
}

function collectValues<T, U>(
  results: readonly StandardResult<T>[],
  map: (values: T[]) => U,
): StandardResult<U> {
  const issues = results.flatMap((result) => (objectValue(result) ? [] : result.issues));
  if (issues.length > 0) return { issues };
  return { value: map(results.map((result) => (result as { value: T }).value)) };
}

function collectUnion<T>(
  results: readonly (StandardResult<T> | Promise<StandardResult<T>>)[],
  path: readonly StandardPathSegment[],
): StandardResult<T> | Promise<StandardResult<T>> {
  if (results.some(isPromiseLike)) {
    return Promise.all(results.map((result) => Promise.resolve(result))).then((resolved) =>
      unionValues(resolved, path),
    );
  }
  return unionValues(results as readonly StandardResult<T>[], path);
}

function unionValues<T>(
  results: readonly StandardResult<T>[],
  path: readonly StandardPathSegment[],
): StandardResult<T> {
  const success = results.find(objectValue);
  return success ?? issue("Value did not match any union member", path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
