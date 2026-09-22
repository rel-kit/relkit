import { assertBoundedString } from "./task-policy-validation.js";

export function copyStrings(value: unknown, name: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value))
    throw new TypeError(`Task ${name} must be an array of non-empty strings`);
  const strings = value.map((entry) => {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new TypeError(`Task ${name} must be an array of non-empty strings`);
    }
    assertBoundedString(entry, `Task ${name} entry`);
    return entry;
  });
  if (new Set(strings).size !== strings.length) throw new TypeError(`Task ${name} must be unique`);
  return Object.freeze(strings);
}

export function assertHook(value: unknown, name: string): void {
  if (value !== undefined && typeof value !== "function")
    throw new TypeError(`Task ${name} must be a function`);
}

export function isSchema(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}

export function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
