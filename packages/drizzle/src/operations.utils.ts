import { and, eq, isNull, type Column, type SQL } from "drizzle-orm";
import type { ModelBinding } from "./runtime-types.js";

/**
 * Requires a complete non-null unique selector.
 * @param binding - Table metadata.
 * @param value - Unknown selector.
 * @returns Validated selector record.
 * @throws TypeError for invalid keys or incomplete uniqueness.
 */
export function selector(binding: ModelBinding, value: unknown): Record<string, unknown> {
  const where = record(value);
  for (const [key, entry] of Object.entries(where)) {
    columnFor(binding, key);
    if (entry === null || entry === undefined)
      throw new TypeError("Selector values cannot be null or undefined");
  }
  if (!binding.metadata.selectors.some((keys) => keys.every((key) => Object.hasOwn(where, key)))) {
    throw new TypeError("Selector must contain a complete primary or unique constraint");
  }
  return where;
}

/**
 * Finds a complete key for MySQL row recovery after writes.
 * @param binding - Table constraints.
 * @param value - Known row/write fields.
 * @returns One complete selector or undefined.
 */
export function recoverable(
  binding: ModelBinding,
  value: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const keys = binding.metadata.selectors.find((candidate) =>
    candidate.every((key) => value[key] !== null && value[key] !== undefined),
  );
  return keys === undefined ? undefined : Object.fromEntries(keys.map((key) => [key, value[key]]));
}

/**
 * Builds equality predicates, treating null as SQL IS NULL.
 * @param binding - Declared columns.
 * @param where - Filter record.
 * @returns Conjoined predicate, or undefined for an empty filter.
 * @throws TypeError for undefined values or unknown columns.
 */
export function clause(binding: ModelBinding, where: Record<string, unknown>): SQL | undefined {
  const filters = Object.entries(where).map(([key, value]) => {
    const column = columnFor(binding, key);
    if (value === undefined) throw new TypeError("Filter values cannot be undefined");
    return value === null ? isNull(column) : eq(column, value);
  });
  return filters.length === 0 ? undefined : and(...filters);
}

/**
 * Resolves one declared column.
 * @param binding - Declared columns.
 * @param key - TypeScript column name.
 * @returns Drizzle column.
 * @throws TypeError for unknown fields.
 */
export function columnFor(binding: ModelBinding, key: string): Column {
  const column = binding.metadata.columns[key];
  if (column === undefined) throw new TypeError(`Unknown table column "${key}"`);
  return column as Column;
}

/**
 * Calls a checked native method with its original receiver.
 * @param target - Database or query builder.
 * @param name - Native method name.
 * @param args - Native arguments.
 * @returns Native method result, preserving thenables.
 * @throws TypeError when the method is unavailable.
 */
export function call(target: unknown, name: string, ...args: unknown[]): unknown {
  if (!isRecord(target) && typeof target !== "function")
    throw new TypeError(`Drizzle ${name} is unavailable`);
  const method = (target as Record<string, unknown>)[name];
  if (typeof method !== "function") throw new TypeError(`Drizzle ${name} is unavailable`);
  return method.apply(target, args);
}

/**
 * Inspects a native capability without invoking it.
 * @param target - Native builder.
 * @param name - Method name.
 * @returns Whether a callable method exists.
 */
export function hasMethod(target: unknown, name: string): boolean {
  return (
    (isRecord(target) || typeof target === "function") &&
    typeof (target as Record<string, unknown>)[name] === "function"
  );
}

/**
 * Requires a plain argument record.
 * @param value - Unknown arguments.
 * @returns Record retaining original keys.
 * @throws TypeError for null, arrays and scalar arguments.
 */
export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError("Data-model arguments must be objects");
  return value;
}

/**
 * Checks bounded pagination without coercing strings.
 * @param value - Unknown limit/offset.
 * @param name - Diagnostic field.
 * @param fallback - Default when absent.
 * @param maximum - Inclusive maximum.
 * @returns Safe non-negative integer.
 * @throws TypeError for invalid pagination.
 */
export function integer(
  value: unknown,
  name: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum)
    throw new TypeError(`${name} is invalid`);
  return Number(value);
}

/**
 * Requires a successful mutation row.
 * @param value - Native row or missing result.
 * @returns Existing row.
 * @throws TypeError when no row was returned.
 */
export function requiredRow(value: unknown): unknown {
  if (value === null || value === undefined) throw new TypeError("Mutation did not return a row");
  return value;
}

/**
 * Checks argument records without invoking getters.
 * @param value - Unknown value.
 * @returns Whether it is a non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
