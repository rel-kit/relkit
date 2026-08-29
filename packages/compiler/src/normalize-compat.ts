import { canonicalJson, type JsonValue } from "@relkit/contracts";
import { getJsonSchema, type StandardSchemaV1 } from "@relkit/schema";
import { id, isRecord, json, refId, schemaKey } from "./normalize-utils.js";
import type { NormalizedDescriptor, NormalizeInput } from "./normalize-types.js";
import { providerMaps } from "./normalize-graph-app.js";

export interface SchemaResult {
  readonly ok: boolean;
  readonly schema?: JsonValue;
  readonly reason?: string;
}

export function schema(value: unknown): SchemaResult {
  if (isSchemaSnapshot(value)) {
    if (value.$relkit === "schema-unavailable") {
      return { ok: false, reason: typeof value.reason === "string" ? value.reason : "unavailable" };
    }
    return json(value.jsonSchema)
      ? { ok: true, schema: value.jsonSchema }
      : { ok: false, reason: "schema snapshot has no JSON Schema projection" };
  }
  if (!isSchema(value)) return { ok: false, reason: "value is not a Standard Schema v1 validator" };
  const result = getJsonSchema(value);
  return result.ok ? result : { ok: false, reason: result.reason };
}

export function isSchema(value: unknown): value is StandardSchemaV1 {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}

export function schemaEquivalent(left: unknown, right: unknown): boolean {
  const a = schema(left);
  const b = schema(right);
  return a.ok && b.ok && canonicalJson(a.schema) === canonicalJson(b.schema);
}

export function schemaProperties(value: unknown):
  | {
      readonly properties: Readonly<Record<string, JsonValue>>;
      readonly required: readonly string[];
    }
  | undefined {
  const result = schema(value);
  const document = result.schema;
  if (!result.ok || document === undefined || Array.isArray(document) || document === null)
    return undefined;
  const object = document as { readonly [key: string]: JsonValue };
  if (object.type !== "object") return undefined;
  const properties: Readonly<Record<string, JsonValue>> = isRecord(object.properties)
    ? (object.properties as Readonly<Record<string, JsonValue>>)
    : {};
  const required = Array.isArray(object.required)
    ? object.required.filter((item: JsonValue): item is string => typeof item === "string")
    : [];
  return { properties, required };
}

export function mappingFields(value: unknown): readonly string[] {
  if (!isRecord(value)) return [];
  if (value.kind === "input" || value.kind === "nested") {
    return isRecord(value.fields) ? Object.keys(value.fields).sort() : [];
  }
  if (value.kind === "optional" || value.kind === "default" || value.kind === "transform") {
    return mappingFields(value.value);
  }
  return [];
}

export function mappingCompatible(mapping: unknown, target: unknown): string | undefined {
  if (!isRecord(mapping) || mapping.kind !== "input")
    return "route request must be an input mapping";
  const targetShape = schemaProperties(target);
  if (targetShape === undefined) return undefined;
  const fields = new Set(mappingFields(mapping));
  const missing = targetShape.required.filter((name) => !fields.has(name));
  return missing.length === 0
    ? undefined
    : `missing required target input fields: ${missing.join(", ")}`;
}

export function jobCompatible(input: unknown, target: unknown): string | undefined {
  const inputSchema = schema(input);
  const targetSchema = schema(target);
  if (!inputSchema.ok || !targetSchema.ok) return undefined;
  return schemaEquivalent(input, target)
    ? undefined
    : "job input schema differs from target input schema";
}

export function targetId(value: unknown): string | undefined {
  return refId(value);
}

export function selectorEntries(value: unknown): readonly string[] {
  if (!isRecord(value)) return [];
  if (value.kind === "single" && isRecord(value.event)) {
    return eventPair(value.event);
  }
  if (value.kind === "anyOf" && Array.isArray(value.events)) {
    return value.events.flatMap(eventPair).sort();
  }
  return [];
}

function eventPair(value: unknown): string[] {
  if (!isRecord(value) || typeof value.eventId !== "string" || !Number.isInteger(value.version)) {
    return [];
  }
  return [`${value.eventId}@${value.version}`];
}

export function matchingEvents(
  pattern: string,
  events: readonly NormalizedDescriptor[],
): readonly string[] {
  const segments = pattern.split(".");
  return events
    .filter((event) => event.kind === "event")
    .filter((event) => matchSegments(segments, event.id.split(".")))
    .map((event) => `${event.id}@${readVersion(event.value)}`)
    .sort();
}

function matchSegments(pattern: readonly string[], value: readonly string[]): boolean {
  if (pattern.length === 0) return value.length === 0;
  if (pattern[0] === "**") {
    return (
      matchSegments(pattern.slice(1), value) ||
      (value.length > 0 && matchSegments(pattern, value.slice(1)))
    );
  }
  return (
    value.length > 0 &&
    (pattern[0] === "*" || pattern[0] === value[0]) &&
    matchSegments(pattern.slice(1), value.slice(1))
  );
}

function readVersion(value: unknown): number {
  return isRecord(value) && typeof value.version === "number" ? value.version : 0;
}

export function schemaEntries(descriptor: NormalizedDescriptor): readonly [string, unknown][] {
  const value = descriptor.value;
  if (!isRecord(value)) return [];
  return ["input", "output", "payload", "key", "value", "data"].flatMap((field) =>
    value[field] === undefined
      ? []
      : [[schemaKey(descriptor.id, field), value[field]] as [string, unknown]],
  );
}

export function cronLike(value: unknown): boolean {
  return typeof value === "string" && value.trim().split(/\s+/).length === 5;
}

export function providerProfiles(input: NormalizeInput): ReadonlyMap<string, readonly string[]> {
  const profiles = new Map<string, Set<string>>();
  for (const descriptor of input.descriptors ?? []) {
    if (!isRecord(descriptor) || descriptor.kind !== "app") continue;
    for (const [capability, bindings] of providerMaps(descriptor)) {
      if (!isRecord(bindings)) continue;
      for (const name of Object.keys(bindings)) {
        const profileName = id(name) ?? name;
        const set = profiles.get(profileName) ?? new Set<string>();
        set.add(capability);
        profiles.set(profileName, set);
      }
    }
  }
  return new Map([...profiles.entries()].map(([name, values]) => [name, [...values].sort()]));
}

function isSchemaSnapshot(value: unknown): value is {
  readonly $relkit: string;
  readonly jsonSchema?: JsonValue;
  readonly reason?: string;
} {
  return isRecord(value) && typeof value.$relkit === "string" && value.$relkit.startsWith("schema");
}

export function isJsonMetadata(value: unknown): value is JsonValue {
  return json(value);
}
