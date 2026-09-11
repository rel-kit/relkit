import type { QueryKey } from "@tanstack/react-query";

export interface ProcedureUtilsLike {
  queryOptions(options: object): object;
  infiniteOptions(options: object): object;
  mutationOptions(options?: object): object;
  queryKey(options?: object): QueryKey;
  infiniteKey(options?: object): QueryKey;
  mutationKey(options?: object): QueryKey;
}

export function procedureUtils(root: unknown, selector: string): ProcedureUtilsLike {
  const value = (root as Readonly<Record<string, unknown>>)[selector];
  if (!isRecord(value)) throw new TypeError(`Unknown Relkit client selector "${selector}"`);
  return value as unknown as ProcedureUtilsLike;
}

export function procedureCall(root: unknown, selector: string): (...args: unknown[]) => unknown {
  const value = (root as Readonly<Record<string, unknown>>)[selector];
  if (typeof value !== "function")
    throw new TypeError(`Unknown Relkit client selector "${selector}"`);
  return value as (...args: unknown[]) => unknown;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}
