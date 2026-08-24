export function validateProviderNode(
  value: Record<string, unknown>,
  index: number,
  fail: (message: string) => never,
): void {
  const capabilities = ["buckets", "cache", "jobs", "events", "models", "observability"];
  if (
    !capabilities.includes(String(value.capability)) ||
    !nonEmpty(value.profile) ||
    !nonEmpty(value.adapter) ||
    (value.ownership !== "external" && value.ownership !== "managed") ||
    !Array.isArray(value.environment)
  ) {
    fail(`Graph nodes[${index}] provider metadata is invalid.`);
  }
  value.environment.forEach((entry, environmentIndex) => {
    if (
      !isRecord(entry) ||
      !nonEmpty(entry.name) ||
      !nonEmpty(entry.type) ||
      typeof entry.sensitive !== "boolean"
    ) {
      fail(`Graph nodes[${index}].environment[${environmentIndex}] is invalid.`);
    }
  });
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
