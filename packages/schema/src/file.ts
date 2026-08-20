import { createSchema, issue, type Schema } from "./standard-schema.js";

export interface FileSchemaOptions {
  readonly maxBytes?: number;
  readonly mediaTypes?: readonly string[];
}

export type FileSchema = Schema<File, File>;

/** Validates a buffered Web File and projects it as an OpenAPI binary value. */
export function fileSchema(options: FileSchemaOptions = {}): FileSchema {
  const maxBytes = positive(options.maxBytes);
  const mediaTypes = normalizeMediaTypes(options.mediaTypes);
  return createSchema(
    (value, path) => {
      if (typeof File === "undefined" || !(value instanceof File)) {
        return issue("Expected a file", path);
      }
      if (maxBytes !== undefined && value.size > maxBytes) {
        return issue(`File exceeds ${maxBytes} bytes`, path);
      }
      if (mediaTypes !== undefined && !mediaTypes.some((type) => matches(type, value.type))) {
        return issue(`Unsupported file media type "${mediaType(value.type) || "unknown"}"`, path);
      }
      return { value };
    },
    {
      jsonSchema: () => ({
        type: "string",
        format: "binary",
        ...(maxBytes === undefined ? {} : { "x-zsys-maxBytes": maxBytes }),
        ...(mediaTypes === undefined ? {} : { "x-zsys-mediaTypes": mediaTypes }),
      }),
    },
  );
}

function positive(value: number | undefined): number | undefined {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
    throw new TypeError("file.maxBytes must be a positive integer");
  }
  return value;
}

function normalizeMediaTypes(values: readonly string[] | undefined): readonly string[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("file.mediaTypes must be a non-empty array");
  }
  const result = values.map((value) => value.trim().toLowerCase());
  if (result.some((value) => !/^[a-z0-9!#$&^_.+-]+\/(?:\*|[a-z0-9!#$&^_.+-]+)$/.test(value))) {
    throw new TypeError("file.mediaTypes contains an invalid media type");
  }
  return Object.freeze([...new Set(result)].sort());
}

function matches(expected: string, actual: string): boolean {
  const value = mediaType(actual);
  return expected.endsWith("/*") ? value.startsWith(expected.slice(0, -1)) : value === expected;
}

function mediaType(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}
