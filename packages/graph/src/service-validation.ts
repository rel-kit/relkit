function fail(message: string): never {
  throw new TypeError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateServiceNode(
  value: Record<string, unknown>,
  index: number,
  validateId: (value: unknown, label: string) => void,
): void {
  if (!Array.isArray(value.functions)) fail(`Graph nodes[${index}].functions must be an array.`);
  if (!Array.isArray(value.events)) fail(`Graph nodes[${index}].events must be an array.`);
  const names = new Set<string>();
  value.functions.forEach((member, memberIndex) => {
    if (!isRecord(member) || !nonEmpty(member.name) || names.has(member.name)) {
      fail(`Graph nodes[${index}].functions[${memberIndex}] is invalid.`);
    }
    names.add(member.name);
    validateId(member.functionId, `Graph nodes[${index}].functions[${memberIndex}].functionId`);
  });
  value.events.forEach((member, memberIndex) => {
    if (!isRecord(member) || !nonEmpty(member.name) || names.has(member.name)) {
      fail(`Graph nodes[${index}].events[${memberIndex}] is invalid.`);
    }
    names.add(member.name);
    validateId(member.eventId, `Graph nodes[${index}].events[${memberIndex}].eventId`);
  });
  if (value.tags !== undefined && !textArray(value.tags))
    fail(`Graph nodes[${index}].tags is invalid.`);
  for (const field of ["title", "description"] as const) {
    if (value[field] !== undefined && typeof value[field] !== "string") {
      fail(`Graph nodes[${index}].${field} is invalid.`);
    }
  }
}

function textArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
