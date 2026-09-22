export function candidates(value: unknown): readonly unknown[] {
  if (!isRecord(value)) return [value];
  return [value, value.data, value.cause, isRecord(value.cause) ? value.cause.data : undefined];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
