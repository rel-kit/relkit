import { createSchema, issue, type Schema } from "./standard-schema.js";
import { getMetadataProjection, getSchemaMetadata, setSchemaMetadata } from "./schema-metadata.js";
import type { JsonSchemaFactory } from "./json-schema.js";
import type { NumberSchema, StringSchema } from "./builder.js";
import type { JsonValue } from "./standard-schema.js";

export function stringSchema(): StringSchema {
  return withString(
    createSchema(
      (value, path) => (typeof value === "string" ? { value } : issue("Expected a string", path)),
      { jsonSchema: () => ({ type: "string" }) },
    ),
  );
}

export function numberSchema(): NumberSchema {
  return withNumber(
    createSchema(
      (value, path) =>
        typeof value === "number" && Number.isFinite(value)
          ? { value }
          : issue("Expected a finite number", path),
      { jsonSchema: () => ({ type: "number" }) },
    ),
  );
}

function withString(
  schema: Schema<string, string>,
  projection = getMetadataProjection(getSchemaMetadata(schema), "legacy"),
  keyword?: readonly [string, string | number],
): StringSchema {
  const refined = Object.assign(schema, {
    min: (length: number, message?: string) =>
      withString(
        schema.refine(
          (value) => value.length >= length,
          message ?? `Must contain at least ${length} characters`,
        ),
        addKeyword(projection, "minLength", length),
        ["minLength", length],
      ),
    max: (length: number, message?: string) =>
      withString(
        schema.refine(
          (value) => value.length <= length,
          message ?? `Must contain at most ${length} characters`,
        ),
        addKeyword(projection, "maxLength", length),
        ["maxLength", length],
      ),
    uuid: (message?: string) =>
      withString(
        schema.refine((value) => UUID.test(value), message ?? "Expected a UUID"),
        addKeyword(projection, "format", "uuid"),
        ["format", "uuid"],
      ),
    datetime: (message?: string) =>
      withString(
        schema.refine(
          (value) => !Number.isNaN(Date.parse(value)),
          message ?? "Expected an ISO datetime",
        ),
        addKeyword(projection, "format", "date-time"),
        ["format", "date-time"],
      ),
    email: (message?: string) =>
      withString(
        schema.refine((value) => EMAIL.test(value), message ?? "Expected an email address"),
        addKeyword(projection, "format", "email"),
        ["format", "email"],
      ),
  }) as StringSchema;
  setSchemaMetadata(
    refined,
    keyword === undefined
      ? (getSchemaMetadata(schema) ?? {})
      : updateProjectionMetadata(schema, projection, keyword[0], keyword[1]),
  );
  return refined;
}

function withNumber(
  schema: Schema<number, number>,
  projection = getMetadataProjection(getSchemaMetadata(schema), "legacy"),
  keyword?: readonly [string, string | number],
): NumberSchema {
  const refined = Object.assign(schema, {
    min: (minimum: number, message?: string) =>
      withNumber(
        schema.refine((value) => value >= minimum, message ?? `Must be at least ${minimum}`),
        addKeyword(projection, "minimum", minimum),
        ["minimum", minimum],
      ),
    max: (maximum: number, message?: string) =>
      withNumber(
        schema.refine((value) => value <= maximum, message ?? `Must be at most ${maximum}`),
        addKeyword(projection, "maximum", maximum),
        ["maximum", maximum],
      ),
    int: (message?: string) =>
      withNumber(
        schema.refine(Number.isInteger, message ?? "Expected an integer"),
        addKeyword(projection, "type", "integer"),
        ["type", "integer"],
      ),
    positive: (message?: string) =>
      withNumber(
        schema.refine((value) => value > 0, message ?? "Expected a positive number"),
        addKeyword(projection, "exclusiveMinimum", 0),
        ["exclusiveMinimum", 0],
      ),
    nonnegative: (message?: string) =>
      withNumber(
        schema.refine((value) => value >= 0, message ?? "Expected a nonnegative number"),
        addKeyword(projection, "minimum", 0),
        ["minimum", 0],
      ),
  }) as NumberSchema;
  setSchemaMetadata(
    refined,
    keyword === undefined
      ? (getSchemaMetadata(schema) ?? {})
      : updateProjectionMetadata(schema, projection, keyword[0], keyword[1]),
  );
  return refined;
}

function updateProjectionMetadata(
  schema: Schema<string, string> | Schema<number, number>,
  projection: JsonSchemaFactory | undefined,
  key: string,
  value: string | number,
) {
  const metadata = getSchemaMetadata(schema) ?? {};
  const input = addKeyword(getMetadataProjection(metadata, "input"), key, value);
  const output = addKeyword(getMetadataProjection(metadata, "output"), key, value);
  return {
    ...metadata,
    ...(projection === undefined ? {} : { jsonSchema: projection }),
    ...(input === undefined ? {} : { inputJsonSchema: input }),
    ...(output === undefined ? {} : { outputJsonSchema: output }),
  };
}

function addKeyword(
  projection: JsonSchemaFactory | undefined,
  key: string,
  value: string | number,
): JsonSchemaFactory | undefined {
  if (!projection) return undefined;
  return () => {
    const schema = projection();
    if (!isRecord(schema)) throw new TypeError("Schema projection must be an object");
    return { ...schema, [key]: value };
  };
}

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
