import type { ProcedureUtilsLike } from "./procedure.types.js";
export type { ProcedureUtilsLike } from "./procedure.types.js";

/**
 * Resolves generated TanStack utilities using exact selector semantics.
 * @param root - Existing root used for lookup or configuration.
 * @param selector - Exact dotted selector or explicit path components.
 * @returns The declared generated TanStack utility object.
 */
export function procedureUtils(
  root: unknown,
  selector: string | readonly string[],
): ProcedureUtilsLike {
  const value = resolveProcedure(root, selector);
  if (!isRecord(value)) throw new TypeError(`Unknown Relkit client selector "${selector}"`);
  return value as unknown as ProcedureUtilsLike;
}

/**
 * Resolves a callable generated procedure using exact selector semantics.
 * @param root - Existing root used for lookup or configuration.
 * @param selector - Exact dotted selector or explicit path components.
 * @returns The declared procedure callable.
 */
export function procedureCall(
  root: unknown,
  selector: string | readonly string[],
): (...args: unknown[]) => unknown {
  const value = resolveProcedure(root, selector);
  if (typeof value !== "function")
    throw new TypeError(`Unknown Relkit client selector "${selector}"`);
  return value as (...args: unknown[]) => unknown;
}

/** Resolves generated paths without changing exact dotted route-key semantics.
 * @param root - Existing root used for lookup or configuration.
 * @param selector - Exact dotted selector or explicit path components.
 * @returns The selected exact or nested procedure value.
 */
export function resolveProcedure(root: unknown, selector: string | readonly string[]): unknown {
  if (typeof selector !== "string") return descend(root, selector);
  if (isRecord(root)) {
    const direct = root[selector];
    if (direct !== undefined) return direct;
  }
  return descend(root, selector.split("."));
}

/**
 * Resolves each explicit path component without rewriting dotted property semantics.
 * @param root - Existing root used for lookup or configuration.
 * @param path - Explicit lookup path components.
 * @returns The explicit nested value, or undefined when traversal is unavailable.
 */
function descend(root: unknown, path: readonly string[]): unknown {
  let value = root;
  for (const key of path) {
    if (!isRecord(value)) return undefined;
    value = value[key];
    if (value === undefined) return undefined;
  }
  return value;
}

/**
 * Checks whether the existing property-access boundary accepts a supplied value.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Whether property access is valid for this boundary.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}
