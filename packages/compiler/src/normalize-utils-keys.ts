import type { SourceLocation } from "@relkit/contracts";

/**
 * Creates a stable schema index key for a descriptor field.
 * @param descriptorId - Stable descriptor identity.
 * @param field - Declared contract field name.
 * @returns A descriptor/field-scoped schema index key.
 */
export function schemaKey(descriptorId: string, field: string): string {
  return `${descriptorId}:${field}`;
}

/**
 * Task schemas have graph-scoped keys so equal task/job/function IDs cannot overwrite one another.
 * @param taskId - Stable task descriptor identity.
 * @param field - Declared contract field name.
 * @param direction - Selected input, output, or legacy wire direction.
 * @returns A task-scoped schema key that cannot collide with job or function IDs.
 */
export function taskSchemaKey(
  taskId: string,
  field: string,
  direction: "input" | "output",
): string {
  return `task.${taskId}:${field}:${direction}`;
}

/**
 * Joins descriptor identity and source provenance for deterministic sorting.
 * @param value - Declared metadata inspected without coercion.
 * @param source - Source provenance or exact generated content.
 * @returns A deterministic descriptor identity/source sorting key.
 */
export function stableKey(value: string, source: SourceLocation): string {
  return `${value}\0${source.file}\0${source.line}\0${source.column}`;
}
