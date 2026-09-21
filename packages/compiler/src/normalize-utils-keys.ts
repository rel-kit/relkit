import type { SourceLocation } from "@relkit/contracts";

export function schemaKey(descriptorId: string, field: string): string {
  return `${descriptorId}:${field}`;
}

/** Task schemas have graph-scoped keys so equal task/job/function IDs cannot overwrite one another. */
export function taskSchemaKey(
  taskId: string,
  field: string,
  direction: "input" | "output",
): string {
  return `task.${taskId}:${field}:${direction}`;
}

export function stableKey(value: string, source: SourceLocation): string {
  return `${value}\0${source.file}\0${source.line}\0${source.column}`;
}
