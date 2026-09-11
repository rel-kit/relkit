import type { StandardSchemaV1 } from "@relkit/schema";

export function assertAgentSchema(value: unknown, name: string): asserts value is StandardSchemaV1 {
  if (!isAgentSchema(value)) {
    throw new TypeError(`Agent ${name} must be a Standard Schema v1 validator`);
  }
}

export function isAgentSchema(value: unknown): value is StandardSchemaV1 {
  if (!isRecord(value) || !isRecord(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}

export function positiveInteger(value: unknown, name: string): number {
  if (!isPositiveInteger(value)) throw new TypeError(`${name} must be a finite positive integer`);
  return value;
}

export function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
