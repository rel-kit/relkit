import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { JsonValue } from "@relkit/contracts";
import { Effect, Metric } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { ClientSchemaMetadata, ClientTypeField } from "./client-contract-schema.types.js";

export type { ClientSchemaMetadata, ClientTypeField } from "./client-contract-schema.types.js";

/** Marker for a schema that cannot be represented in the client contract. */
export const dynamicClientSchema = Object.freeze({ kind: "dynamic" as const });

const mergeCount = Metric.counter("relkit.agents.client_schema.merge.total");
const selectCount = Metric.counter("relkit.agents.client_schema.select.total");
const projectCount = Metric.counter("relkit.agents.client_schema.project.total");

/**
 * Merges projected object schemas while preserving input order.
 *
 * @param values - Source schemas and schema-like values.
 * @returns An Effect with the merged JSON schema; it has no typed failure.
 * @example
 * const schema = Effect.runSync(mergeClientSchemasEffect([{ type: "object" }]));
 */
export const mergeClientSchemasEffect = Effect.fn("Agents.clientSchema.merge")(
  function* (values: readonly unknown[]) {
    const documents: Record<string, unknown>[] = [];
    for (const value of values) {
      const document = yield* clientSchemaMetadataEffect(value);
      if (isJsonSchemaObject(document)) documents.push(document);
    }
    const merged: ClientSchemaMetadata = {
      type: "object",
      properties: Object.assign({}, ...documents.map(schemaProperties)),
      required: [...new Set(documents.flatMap(schemaRequired))],
    } as JsonValue;
    yield* Metric.update(mergeCount, 1);
    return merged;
  },
  (effect) => observeAgent("client-schema.merge", effect),
);

/**
 * Synchronously merges client schemas for existing descriptor callers.
 *
 * @param values - Source schemas and schema-like values.
 * @returns The merged JSON schema.
 * @example
 * const schema = mergeClientSchemas([{ type: "object" }]);
 */
export function mergeClientSchemas(values: readonly unknown[]): ClientSchemaMetadata {
  return Effect.runSync(mergeClientSchemasEffect(values));
}

/**
 * Selects named client state fields from a projected object schema.
 *
 * @param schema - Projected client schema.
 * @param keys - Field names to expose, in the desired order.
 * @returns An Effect with immutable field metadata; it has no typed failure.
 * @example
 * const fields = Effect.runSync(selectedClientFieldsEffect({ type: "object" }, ["name"]));
 */
export const selectedClientFieldsEffect = Effect.fn("Agents.clientSchema.select")(
  function* (schema: ClientSchemaMetadata, keys?: readonly string[]) {
    const fields = yield* Effect.sync((): readonly ClientTypeField[] => {
      if (keys === undefined || !isJsonSchemaObject(schema)) return Object.freeze([]);
      const required = new Set(schemaRequired(schema));
      const properties = schemaProperties(schema);
      return Object.freeze(
        keys.map((name) => {
          const value = properties[name];
          const field = value === undefined ? dynamicClientSchema : value;
          const defaulted = isRecord(field) && Object.hasOwn(field, "default");
          return {
            name,
            schema: field,
            ...(!required.has(name) && !defaulted ? { optional: true as const } : {}),
          };
        }),
      );
    });
    yield* Metric.update(selectCount, 1);
    return fields;
  },
  (effect) => observeAgent("client-schema.select", effect),
);

/**
 * Synchronously selects client fields for existing descriptor callers.
 *
 * @param schema - Projected client schema.
 * @param keys - Field names to expose.
 * @returns Immutable field metadata.
 * @example
 * const fields = selectedClientFields({ type: "object" }, ["name"]);
 */
export function selectedClientFields(
  schema: ClientSchemaMetadata,
  keys?: readonly string[],
): readonly ClientTypeField[] {
  return Effect.runSync(selectedClientFieldsEffect(schema, keys));
}

/**
 * Projects a schema-like value to safe client metadata.
 *
 * @param value - A JSON Schema document or a LangChain-compatible schema.
 * @returns An Effect with projected metadata or the dynamic marker; it has no typed failure.
 * @example
 * const metadata = Effect.runSync(clientSchemaMetadataEffect({ type: "string" }));
 */
export const clientSchemaMetadataEffect = Effect.fn("Agents.clientSchema.project")(
  function* (value: unknown) {
    const metadata = yield* Effect.sync((): ClientSchemaMetadata => {
      if (isDynamic(value) || isJsonSchemaObject(value)) return value;
      try {
        return JSON.parse(JSON.stringify(toJsonSchema(value as never))) as JsonValue;
      } catch {
        return dynamicClientSchema;
      }
    });
    yield* Metric.update(projectCount, 1);
    return metadata;
  },
  (effect) => observeAgent("client-schema.project", effect),
);

/**
 * Synchronously projects schema metadata for existing descriptor callers.
 *
 * @param value - A JSON Schema document or a LangChain-compatible schema.
 * @returns Projected metadata or the dynamic marker.
 * @example
 * const metadata = clientSchemaMetadata({ type: "string" });
 */
export function clientSchemaMetadata(value: unknown): ClientSchemaMetadata {
  return Effect.runSync(clientSchemaMetadataEffect(value));
}

function isJsonSchemaObject(value: unknown): value is Record<string, JsonValue> {
  if (!isRecord(value) || value.kind === "dynamic") return false;
  return (
    ["type", "properties", "oneOf", "anyOf", "allOf", "enum", "const", "$ref"].some((key) =>
      Object.hasOwn(value, key),
    ) && isJsonValue(value)
  );
}

function schemaProperties(value: Record<string, unknown>): Record<string, ClientSchemaMetadata> {
  return isRecord(value.properties)
    ? (value.properties as Record<string, ClientSchemaMetadata>)
    : {};
}

function schemaRequired(value: Record<string, unknown>): string[] {
  return Array.isArray(value.required)
    ? value.required.filter((item): item is string => typeof item === "string")
    : [];
}

function isDynamic(value: unknown): value is { readonly kind: "dynamic" } {
  return isRecord(value) && value.kind === "dynamic" && Object.keys(value).length === 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isJsonValue(entry, seen))
    : Object.values(value).every((entry) => isJsonValue(entry, seen));
  seen.delete(value);
  return valid;
}
