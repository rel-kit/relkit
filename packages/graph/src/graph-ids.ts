/** Graph-only identity mapping; durable/public IDs remain unprefixed in metadata. */
export function graphId(
  kind: string,
  durableId: string,
  options: { readonly taskBackedJob?: boolean } = {},
): string {
  if (kind === "task") return `task.${durableId}`;
  if (kind === "job" && options.taskBackedJob === true) return `job.${durableId}`;
  return durableId;
}

export function isTaskBackedJob(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value.task) &&
    isRecord(value.task.ref) &&
    value.task.ref.kind === "task"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
