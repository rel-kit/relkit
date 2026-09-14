import { canonicalJson, type JsonValue } from "@relkit/contracts";
import { id, isRecord, refId, schemaKey, taskSchemaKey } from "./normalize-utils.js";
import type { NormalizedDescriptor, NormalizeInput } from "./normalize-types.js";
import { providerMaps } from "./normalize-graph-app.js";
export { isSchema, schema, type SchemaDirection, type SchemaResult, schemaHash } from "./normalize-schema-projection.js";
import { schema, type SchemaDirection } from "./normalize-schema-projection.js";

export type SchemaEntry = readonly [string, unknown, SchemaDirection?];

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

export function schemaEntries(descriptor: NormalizedDescriptor): readonly SchemaEntry[] {
  const value = descriptor.value;
  if (!isRecord(value)) return [];
  const fields =
    (
      {
        function: ["input", "output", "progress"],
        task: ["input", "output", "progress"],
        job: ["input", "output", "progress"],
        event: ["input"],
        cache: ["key", "value"],
        agent: ["input", "output"],
        error: ["data"],
      } as Readonly<Record<string, readonly string[]>>
    )[descriptor.kind] ?? [];
  if (descriptor.kind === "job" && isRecord(value.task)) return [];
  const direct =
    descriptor.kind === "task"
      ? taskSchemaEntries(descriptor.id, value, fields)
      : fields.flatMap((field) =>
          value[field] === undefined
            ? []
            : [[schemaKey(descriptor.id, field), value[field]] as SchemaEntry],
        );
  if (descriptor.kind !== "channel") return direct;
  const events = isRecord(value.events)
    ? Object.entries(value.events).map(
        ([event, eventSchema]) =>
          [`${descriptor.id}:event:${event}`, eventSchema] as SchemaEntry,
      )
    : [];
  const presence =
    isRecord(value.presence) && value.presence.member !== undefined
      ? [[`${descriptor.id}:presence:member`, value.presence.member] as SchemaEntry]
      : [];
  return [
    ...direct,
    ...(value.params === undefined
      ? []
      : [[`${descriptor.id}:params`, value.params] as SchemaEntry]),
    ...events,
    ...presence,
  ];
}

function taskSchemaEntries(
  taskId: string,
  value: Record<string, unknown>,
  fields: readonly string[],
): readonly SchemaEntry[] {
  const entries: SchemaEntry[] = [];
  for (const field of fields) {
    const candidate = value[field];
    if (candidate === undefined) continue;
    if (field === "input") {
      entries.push([taskSchemaKey(taskId, field, "input"), candidate, "input"]);
      entries.push([
        taskSchemaKey(taskId, field, "output"),
        value.inputWire ?? candidate,
        "output",
      ]);
      continue;
    }
    entries.push([taskSchemaKey(taskId, field, "output"), candidate, "output"]);
  }
  return entries;
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

export function isJsonMetadata(value: unknown): value is JsonValue {
  try {
    canonicalJson(value);
    return true;
  } catch {
    return false;
  }
}
