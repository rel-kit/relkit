import type { QueryKey } from "@tanstack/react-query";

export interface ProcedureUtilsLike {
  queryOptions(options: object): object;
  infiniteOptions(options: object): object;
  mutationOptions(options?: object): object;
  queryKey(options?: object): QueryKey;
  infiniteKey(options?: object): QueryKey;
  mutationKey(options?: object): QueryKey;
}

export function procedureUtils(
  root: unknown,
  selector: string | readonly string[],
): ProcedureUtilsLike {
  const value = resolveProcedure(root, selector);
  if (!isRecord(value)) throw new TypeError(`Unknown Relkit client selector "${selector}"`);
  return value as unknown as ProcedureUtilsLike;
}

export function procedureCall(
  root: unknown,
  selector: string | readonly string[],
): (...args: unknown[]) => unknown {
  const value = resolveProcedure(root, selector);
  if (typeof value !== "function")
    throw new TypeError(`Unknown Relkit client selector "${selector}"`);
  return value as (...args: unknown[]) => unknown;
}

/** Resolves generated paths without changing exact dotted route-key semantics. */
export function resolveProcedure(root: unknown, selector: string | readonly string[]): unknown {
  if (typeof selector !== "string") return descend(root, selector);
  if (isRecord(root)) {
    const direct = root[selector];
    if (direct !== undefined) return direct;
  }
  return descend(root, selector.split("."));
}

function descend(root: unknown, path: readonly string[]): unknown {
  let value = root;
  for (const key of path) {
    if (!isRecord(value)) return undefined;
    value = value[key];
    if (value === undefined) return undefined;
  }
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}
