import type { JsonValue, StandardSchemaV1 } from "./standard-schema.js";
import {
  getMetadataProjection,
  getSchemaMetadata,
  isMetadataOptional,
  type SchemaProjectionDirection,
} from "./schema-metadata.js";

export const JSON_SCHEMA_UNAVAILABLE = "RELKIT_SCHEMA_UNAVAILABLE" as const;

/** A JSON Schema document with JSON-safe values and deterministic key order. */
export type JsonSchema = { readonly [key: string]: JsonValue };

export interface JsonSchemaAvailable {
  readonly ok: true;
  readonly schema: JsonSchema;
}

export interface JsonSchemaUnavailable {
  readonly ok: false;
  readonly code: typeof JSON_SCHEMA_UNAVAILABLE;
  readonly reason: string;
}

export type JsonSchemaResult = JsonSchemaAvailable | JsonSchemaUnavailable;
export type JsonSchemaFactory = () => JsonValue;
export type JsonSchemaDirection = SchemaProjectionDirection;
export interface JsonSchemaOptions {
  readonly direction?: JsonSchemaDirection;
}

/** Returns a schema's deterministic projection hook without executing it. */
export function getSchemaProjection(
  schema: StandardSchemaV1,
  direction: JsonSchemaDirection | "legacy" = "legacy",
): JsonSchemaFactory | undefined {
  const metadata = getSchemaMetadata(schema);
  const projected = getMetadataProjection(metadata, direction);
  if (projected) return projected;
  const relkit = schema as StandardSchemaV1 & {
    readonly relkit?: {
      readonly jsonSchema?: JsonSchemaFactory;
      readonly inputJsonSchema?: JsonSchemaFactory;
      readonly outputJsonSchema?: JsonSchemaFactory;
    };
  };
  const relkitProjection =
    direction === "input"
      ? relkit.relkit?.inputJsonSchema
      : direction === "output"
        ? relkit.relkit?.outputJsonSchema
        : relkit.relkit?.jsonSchema;
  if (relkitProjection) return relkitProjection;
  if (direction === "legacy") return undefined;
  const standard = schema?.["~standard"] as StandardSchemaV1["~standard"] & {
    readonly jsonSchema?: {
      readonly input?: (options: { readonly target: "draft-2020-12" }) => Record<string, unknown>;
      readonly output?: (options: { readonly target: "draft-2020-12" }) => Record<string, unknown>;
    };
  };
  const hook = standard.jsonSchema?.[direction];
  return hook === undefined ? undefined : () => hook({ target: "draft-2020-12" }) as JsonValue;
}

/** Returns whether a schema accepts an omitted object property. */
export function isSchemaOptional(
  schema: StandardSchemaV1,
  direction: JsonSchemaDirection | "legacy" = "legacy",
): boolean {
  return isMetadataOptional(getSchemaMetadata(schema), direction);
}

/** Obtains or generates a canonical JSON Schema without guessing unsupported behavior. */
export function getJsonSchema(
  schema: StandardSchemaV1,
  options?: JsonSchemaOptions,
): JsonSchemaResult {
  try {
    if (schema?.["~standard"]?.version !== 1) {
      return unavailable("Schema is not a Standard Schema v1 validator");
    }
    const direction = options?.direction ?? "legacy";
    if (direction !== "legacy" && direction !== "input" && direction !== "output") {
      return unavailable(`Unsupported schema projection direction "${String(direction)}"`);
    }
    const projection = getSchemaProjection(schema, direction);
    if (!projection) return unavailable("Schema does not expose a deterministic projection");
    const value = sortJsonValue(projection(), "$", undefined);
    if (!isRecord(value)) return unavailable("Schema projection must be a JSON object");
    return { ok: true, schema: value };
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Alias for callers that describe projection as a conversion. */
export const toJsonSchema = getJsonSchema;

export function isJsonSchemaAvailable(result: JsonSchemaResult): result is JsonSchemaAvailable {
  return result.ok;
}

function unavailable(reason: string): JsonSchemaUnavailable {
  return { ok: false, code: JSON_SCHEMA_UNAVAILABLE, reason };
}

function sortJsonValue(value: unknown, path: string, key: string | undefined): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw invalid(path, "non-finite numbers are not supported");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw invalid(path, "array prototype");
    const names = Object.getOwnPropertyNames(value);
    if (names.some((name) => name !== "length" && !isArrayIndex(name, value.length))) {
      throw invalid(path, "array properties");
    }
    const items = value.map((item, index) => sortJsonValue(item, `${path}[${index}]`, undefined));
    return key === "required" && items.every((item): item is string => typeof item === "string")
      ? [...items].sort()
      : items;
  }
  if (typeof value !== "object" || value === undefined) throw invalid(path, "non-JSON data");
  if (!isPlainObject(value)) throw invalid(path, "object prototype");
  if (Object.getOwnPropertySymbols(value).length > 0) throw invalid(path, "symbol keys");
  const result: Record<string, JsonValue> = {};
  for (const name of Object.keys(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !("value" in descriptor)) throw invalid(`${path}.${name}`, "accessor");
    result[name] = sortJsonValue(descriptor.value, `${path}.${name}`, name);
  }
  return result;
}

function invalid(path: string, reason: string): TypeError {
  return new TypeError(`Invalid JSON Schema projection at ${path}: ${reason}`);
}

function isRecord(value: JsonValue): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function isArrayIndex(key: string, length: number): boolean {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}
