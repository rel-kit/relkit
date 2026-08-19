import type { LiteralValue } from "./env-types.js";

export function parseNumber(value: string): number {
  const parsed = Number(value.trim());
  if (value.trim() === "" || !Number.isFinite(parsed)) {
    throw new TypeError("Expected a finite number");
  }
  return parsed;
}

export function parsePort(value: string): number {
  const parsed = parseNumber(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new TypeError("Expected a port from 1 through 65535");
  }
  return parsed;
}

export function parseBoolean(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new TypeError("Expected true or false");
}

export function parseLiteral<T extends LiteralValue>(value: string, values: readonly T[]): T {
  const match = values.find((expected) => String(expected) === value);
  if (match === undefined) throw new TypeError(`Expected one of: ${values.join(", ")}`);
  return match;
}
