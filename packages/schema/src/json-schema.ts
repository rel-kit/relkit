import { Data, Effect } from "effect";
import { getJsonSchemaEffect, SchemaProjectorLive } from "./json-schema-effect.js";
import { runSchemaSync } from "./schema-observability.js";
import type { JsonValue, StandardSchemaV1 } from "./standard-schema.types.js";
import type {
  JsonSchemaAvailable,
  JsonSchemaOptions,
  JsonSchemaResult,
  JsonSchemaUnavailable,
} from "./json-schema.types.js";

/** Stable code for unavailable deterministic JSON Schema projections. */
export const JSON_SCHEMA_UNAVAILABLE = "RELKIT_SCHEMA_UNAVAILABLE" as const;
export { getSchemaProjection, isSchemaOptional } from "./json-schema-inspection.js";

export type {
  JsonSchema,
  JsonSchemaAvailable,
  JsonSchemaDirection,
  JsonSchemaFactory,
  JsonSchemaOptions,
  JsonSchemaResult,
  JsonSchemaUnavailable,
} from "./json-schema.types.js";

/**
 * Produces a canonical JSON Schema or an unavailable result.
 * @param schema - Compatible schema to project.
 * @param options - Optional input or output direction.
 * @returns A projection result with schema or structured reason.
 * @example getJsonSchema(z.string());
 */
export function getJsonSchema(
  schema: StandardSchemaV1,
  options?: JsonSchemaOptions,
): JsonSchemaResult {
  return runSchemaSync(
    Effect.provide(
      getJsonSchemaEffect(schema, options).pipe(
        Effect.map((value) => ({ ok: true, schema: value }) as const),
        Effect.catchTag("JsonSchemaUnavailableError", (error) =>
          Effect.succeed(unavailable(error.reason)),
        ),
      ),
      SchemaProjectorLive,
    ),
  );
}

/**
 * Alias for callers that describe projection as a conversion.
 * @example toJsonSchema(z.string());
 */
export const toJsonSchema = getJsonSchema;

/**
 * Narrows a successful projection result.
 * @param result - Projection result to inspect.
 * @returns Whether the result contains a JSON Schema.
 * @example isJsonSchemaAvailable(getJsonSchema(z.string()));
 */
export function isJsonSchemaAvailable(result: JsonSchemaResult): result is JsonSchemaAvailable {
  return runSchemaSync(isJsonSchemaAvailableEffect(result));
}

/**
 * Checks projection availability inside Effect.
 * @param result - Projection result to inspect.
 * @returns Whether a JSON Schema is available.
 * @example Effect.runSync(isJsonSchemaAvailableEffect(getJsonSchema(z.string())));
 */
export function isJsonSchemaAvailableEffect(result: JsonSchemaResult): Effect.Effect<boolean> {
  return Effect.sync(() => result.ok);
}

function unavailable(reason: string): JsonSchemaUnavailable {
  return { ok: false, code: JSON_SCHEMA_UNAVAILABLE, reason };
}

/**
 * Tagged failure for non-JSON projection data.
 * The original validation exception remains in `cause`.
 * @example Effect.catchTag("JsonSchemaValueError", (error) => Effect.succeed(error.cause));
 */
export class JsonSchemaValueError extends Data.TaggedError("JsonSchemaValueError")<{
  readonly cause: unknown;
}> {}

/**
 * Canonicalizes JSON-safe projection data inside Effect.
 * @param value - Projection value to canonicalize.
 * @param path - Current diagnostic path.
 * @param key - Parent property name when ordering required fields.
 * @returns Sorted JSON data, or JsonSchemaValueError.
 * @example Effect.runSync(sortJsonValueEffect({ b: 2, a: 1 }, "$", undefined));
 */
export function sortJsonValueEffect(
  value: unknown,
  path: string,
  key: string | undefined,
): Effect.Effect<JsonValue, JsonSchemaValueError> {
  return Effect.try({
    try: () => sortJsonValueRaw(value, path, key),
    catch: (cause) => new JsonSchemaValueError({ cause }),
  });
}

/**
 * Canonicalizes JSON-safe projection data and preserves TypeError behavior.
 * @param value - Projection value to canonicalize.
 * @param path - Current diagnostic path.
 * @param key - Parent property name when ordering required fields.
 * @returns Sorted JSON data.
 * @throws TypeError for unsupported data.
 * @example sortJsonValue({ b: 2, a: 1 }, "$", undefined);
 */
export function sortJsonValue(value: unknown, path: string, key: string | undefined): JsonValue {
  try {
    return runSchemaSync(sortJsonValueEffect(value, path, key));
  } catch (error) {
    if (error instanceof JsonSchemaValueError) throw error.cause;
    throw error;
  }
}

function sortJsonValueRaw(value: unknown, path: string, key: string | undefined): JsonValue {
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
    const items = value.map((item, index) =>
      sortJsonValueRaw(item, `${path}[${index}]`, undefined),
    );
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
    result[name] = sortJsonValueRaw(descriptor.value, `${path}.${name}`, name);
  }
  return result;
}

function invalid(path: string, reason: string): TypeError {
  return new TypeError(`Invalid JSON Schema projection at ${path}: ${reason}`);
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function isArrayIndex(key: string, length: number): boolean {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}
