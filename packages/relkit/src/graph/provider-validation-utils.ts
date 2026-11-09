/**
 * Checks that a list contains unique nonempty strings.
 * @param value - Candidate list.
 * @returns Whether every element is unique nonempty text.
 * @example textList(["atomicIncrement"]);
 */
export function textList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(nonEmpty) && new Set(value).size === value.length;
}

/**
 * Checks for nonempty text after trimming.
 * @param value - Candidate value.
 * @returns Whether the value contains non-whitespace text.
 * @example nonEmpty("default");
 */
export function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Checks for a non-array object projection.
 * @param value - Candidate value.
 * @returns Whether the value is a record.
 * @example isRecord({ profile: "default" });
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
