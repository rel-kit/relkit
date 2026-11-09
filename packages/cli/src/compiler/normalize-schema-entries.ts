import type { SchemaEntry } from "./normalize-compat.types.js";

import { isRecord, schemaKey, taskSchemaKey } from "./normalize-utils.js";
import type { NormalizedDescriptor } from "./normalize-types.js";

/**
 * Collects declared descriptor schemas and their wire directions.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns Field names, schema values, and wire directions owned by the descriptor.
 */
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
        ([event, eventSchema]) => [`${descriptor.id}:event:${event}`, eventSchema] as SchemaEntry,
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

/**
 * Collects task schemas under directional task-owned keys.
 * @param taskId - Stable task descriptor identity.
 * @param value - Declared metadata inspected without coercion.
 * @param fields - Contract field names to project.
 * @returns Task-owned directional schema entries that cannot collide with other kinds.
 */
export function taskSchemaEntries(
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
